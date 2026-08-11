// LumaDak — Express-server met Stripe Checkout, klantaccounts en beheerpaneel.
//
// Environment variables op Railway:
//   STRIPE_SECRET_KEY      — sk_test_... (test) of sk_live_... (live)          [verplicht om te kunnen afrekenen]
//   STRIPE_WEBHOOK_SECRET  — whsec_...                                          [verplicht: zonder handtekening
//                            weigeren we webhooks, anders kan iedereen een
//                            bestelling verzinnen]
//   DATABASE_URL           — zet Railway zelf zodra je Postgres toevoegt        [nodig voor accounts]
//   SESSIE_GEHEIM          — lange willekeurige string, houdt klanten ingelogd  [aanbevolen]
//   BEHEERDER_EMAILS       — bv. info@lumadak.nl — wie in /beheer mag           [nodig voor beheer]
//   RESEND_API_KEY         — voor bestelbevestiging en statusmails              [aanbevolen]
//   SITE_URL               — bv. https://lumadak.nl                             [aanbevolen]

const express = require('express');
const path = require('path');
const PRODUCTS = require('./producten.js');
const db = require('./db');
const auth = require('./auth');
const mail = require('./mail');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway zit achter een proxy; zonder dit staat req.protocol altijd op http
// en kloppen de secure-cookies en terugkeer-URL's niet.
app.set('trust proxy', 1);

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// ---------- Helpers ----------

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

// Verzendkosten: €25 per dakraam (categorieën 'dakramen' en 'platdak'),
// toebehoren en zonwering gratis. Zelfde regel als in de winkelwagen op de site.
function berekenVerzendkosten(regels) {
  return regels.reduce((n, r) =>
    (r.product.cat === 'dakramen' || r.product.cat === 'platdak') ? n + r.qty : n, 0) * 25;
}

// ---------- Stripe webhook (raw body, dus vóór express.json) ----------

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(500).send('Stripe niet geconfigureerd');

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    // Bewust hard weigeren. Zonder handtekening kan iedereen die het adres kent
    // een "geslaagde betaling" posten en zo een order en een account aanmaken.
    // Stripe blijft het bericht 3 dagen opnieuw sturen, dus zodra de sleutel
    // er staat, komen gemiste bestellingen alsnog binnen.
    console.error('[webhook] GEWEIGERD: STRIPE_WEBHOOK_SECRET ontbreekt.');
    return res.status(500).send('Webhook secret ontbreekt op de server.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] verificatie mislukt:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  // Stripe eerst bevestigen, daarna pas het werk doen: een trage mail mag geen
  // timeout veroorzaken waardoor Stripe alles nog eens stuurt.
  res.json({ received: true });

  if (event.type === 'checkout.session.completed') {
    verwerkBetaling(event.data.object, baseUrl(req))
      .catch(err => console.error('[order] verwerken mislukt:', err.message));
  }
});

// Zet een geslaagde Stripe-sessie om in een bestelling, een klant en de mails.
async function verwerkBetaling(session, url) {
  const klantgegevens = session.customer_details || {};
  const email = klantgegevens.email || '';

  // De regels staan als "id:aantal,id:aantal" in de metadata. De namen en
  // prijzen halen we uit producten.js — dezelfde bron waarmee we hebben
  // afgerekend, dus wat in de database komt is per definitie wat de klant betaalde.
  const regels = String(session.metadata?.regels || '')
    .split(',').filter(Boolean)
    .map(paar => {
      const [id, aantal] = paar.split(':').map(Number);
      const product = PRODUCTS.find(p => p.id === id);
      return product && aantal > 0
        ? { productId: product.id, naam: product.name, aantal, stuksprijsCent: Math.round(product.price * 100) }
        : null;
    })
    .filter(Boolean);

  if (!db.beschikbaar()) {
    // Zonder database geen account, maar de winkelier moet het wél weten.
    console.log('[order] betaling geslaagd (geen database):', session.id, email);
    const nep = {
      bestelnummer: session.id.slice(-10), bedrag_cent: session.amount_total,
      verzendkosten_cent: 0, montage: session.metadata?.montage === 'ja',
      naam: klantgegevens.name || '', email, telefoon: klantgegevens.phone || '',
      adres: klantgegevens.address || {}, regels: regels.map(r => ({
        naam: r.naam, aantal: r.aantal, stuksprijs_cent: r.stuksprijsCent })),
    };
    await mail.verstuur({ to: mail.WINKEL_MAIL, ...mail.interneMelding(nep, url) });
    return;
  }

  if (!email) {
    console.error('[order] geen e-mailadres in de Stripe-sessie:', session.id);
    return;
  }

  const klant = await db.vindOfMaakKlant({
    email, naam: klantgegevens.name, telefoon: klantgegevens.phone,
  });

  const { bestelling, nieuw } = await db.bewaarBestelling({
    klantId: klant.id,
    stripeSessionId: session.id,
    bedragCent: session.amount_total,
    verzendkostenCent: Number(session.metadata?.verzendkosten_cent || 0),
    montage: session.metadata?.montage === 'ja',
    naam: klantgegevens.name, email, telefoon: klantgegevens.phone,
    adres: klantgegevens.address || {},
    regels,
  });

  // Stripe mag hetzelfde bericht vaker sturen; dan niet nóg een keer mailen.
  if (!nieuw) {
    console.log('[order] al verwerkt, overgeslagen:', bestelling.bestelnummer);
    return;
  }
  console.log('[order] opgeslagen:', bestelling.bestelnummer, klant.email);

  const voorMail = { ...bestelling, regels: regels.map(r => ({
    naam: r.naam, aantal: r.aantal, stuksprijs_cent: r.stuksprijsCent })) };

  // Heeft de klant nog geen wachtwoord, dan zetten we het account voor hem klaar
  // en gaat er een instel-link mee in de bevestiging.
  let wachtwoordLink = null;
  if (!klant.wachtwoord_hash) {
    await db.trekTokensIn(klant.id, 'instellen');
    const token = await db.maakToken(klant.id, 'instellen', 7 * 24 * 60);
    wachtwoordLink = `${url}/wachtwoord-instellen?token=${encodeURIComponent(token)}`;
  }

  await Promise.all([
    mail.verstuur({
      to: klant.email, replyTo: mail.WINKEL_MAIL,
      ...mail.bestelbevestiging(voorMail, wachtwoordLink, url),
    }),
    mail.verstuur({
      to: mail.WINKEL_MAIL, replyTo: klant.email,
      ...mail.interneMelding(voorMail, url),
    }),
  ]);
}

// ---------- Body's, sessies en routes ----------

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

if (db.beschikbaar()) {
  app.use(auth.sessieMiddleware());
  app.use(require('./routes-account'));
  app.use(require('./routes-beheer'));
} else {
  // Zonder database bestaan de accountpagina's simpelweg niet; dat is duidelijker
  // dan een pagina die vastloopt op een ontbrekende verbinding.
  app.use(['/account', '/inloggen', '/beheer', '/wachtwoord-vergeten', '/wachtwoord-instellen'],
    (_req, res) => res.status(503).send(
      'Klantaccounts zijn nog niet actief: er is geen database gekoppeld.'));
}

app.post('/api/checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Betalen is nog niet geactiveerd (STRIPE_SECRET_KEY ontbreekt).' });
    }

    const { items, montage } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Winkelwagen is leeg.' });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: 'Te veel regels in de winkelwagen.' });
    }

    // Valideer server-side: alleen id + aantal uit de browser, prijzen uit producten.js
    const regels = [];
    for (const item of items) {
      const id = Number(item.id);
      const qty = Math.floor(Number(item.qty));
      const product = PRODUCTS.find(p => p.id === id);
      if (!product || !Number.isFinite(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({ error: 'Ongeldige winkelwagen. Ververs de pagina en probeer opnieuw.' });
      }
      regels.push({ product, qty });
    }

    const verzendkosten = berekenVerzendkosten(regels);
    const url = baseUrl(req);

    const line_items = regels.map(({ product, qty }) => ({
      quantity: qty,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(product.price * 100),
        product_data: {
          name: product.name,
          ...(product.img ? { images: [`${url}/fotos/${product.img}`] } : {}),
        },
      },
    }));

    const overzicht = regels.map(({ product, qty }) => `${qty}× ${product.name}`).join('\n');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['ideal', 'card'],
      line_items,
      shipping_address_collection: { allowed_countries: ['NL', 'BE'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: verzendkosten * 100, currency: 'eur' },
          display_name: verzendkosten > 0 ? 'Thuisbezorgd door vakhandel-partner' : 'Gratis meebezorgd',
        },
      }],
      phone_number_collection: { enabled: true },
      locale: 'nl',
      metadata: {
        montage: montage ? 'ja' : 'nee',
        overzicht: overzicht.slice(0, 490),                 // metadata-limiet: 500 tekens per veld
        // Compacte weergave waarmee de webhook de bestelling exact reconstrueert.
        regels: regels.map(({ product, qty }) => `${product.id}:${qty}`).join(',').slice(0, 490),
        verzendkosten_cent: String(verzendkosten * 100),
      },
      success_url: `${url}/bedankt.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url}/?betaling=geannuleerd`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[checkout] fout:', err.message);
    res.status(500).json({ error: 'Er ging iets mis bij het starten van de betaling. Probeer het opnieuw.' });
  }
});

// ---------- Statische site ----------

app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    // HTML en de productcatalogus nooit cachen: prijs- en tekstwijzigingen
    // moeten direct zichtbaar zijn (en synchroon lopen met wat Stripe rekent)
    if (/\.html$/i.test(filePath) || /producten\.js$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|css|js|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

app.get('/gezondheid', (_req, res) => res.json({
  ok: true,
  database: db.beschikbaar(),
  stripe: Boolean(stripe),
}));

app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'index.html')));

// ---------- Opstarten ----------

async function start() {
  if (db.beschikbaar()) {
    try {
      await db.migreer();
      console.log('[db] verbonden, schema bijgewerkt');
    } catch (err) {
      // Beter meteen stoppen dan draaien met een half schema: dan verdwijnen
      // er stilletjes bestellingen.
      console.error('[db] migratie mislukt:', err.message);
      process.exit(1);
    }
  } else {
    console.warn('LET OP: DATABASE_URL niet gezet — klantaccounts staan uit.');
  }

  app.listen(PORT, () => {
    console.log(`LumaDak draait op poort ${PORT}`);
    if (!stripe) console.warn('LET OP: STRIPE_SECRET_KEY niet gezet — afrekenen is uitgeschakeld.');
    if (!process.env.STRIPE_WEBHOOK_SECRET) console.warn('LET OP: STRIPE_WEBHOOK_SECRET niet gezet — webhooks worden geweigerd.');
    if (!process.env.BEHEERDER_EMAILS) console.warn('LET OP: BEHEERDER_EMAILS niet gezet — /beheer is voor niemand toegankelijk.');
  });
}

start();
