// LumaDak — Express-server met Stripe Checkout
// Serveert de statische site en handelt betalingen af via Stripe (iDEAL + kaart).
//
// Vereiste environment variables op Railway:
//   STRIPE_SECRET_KEY      — sk_test_... (test) of sk_live_... (live)
//   STRIPE_WEBHOOK_SECRET  — whsec_... (optioneel maar aanbevolen, voor orderbevestiging)
//   RESEND_API_KEY         — optioneel: orderbevestiging per e-mail naar info@lumadak.nl
//   SITE_URL               — optioneel: bv. https://lumadak.nl (anders afgeleid van request)

const express = require('express');
const path = require('path');
const PRODUCTS = require('./producten.js');

const app = express();
const PORT = process.env.PORT || 3000;

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

  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
      console.warn('[webhook] STRIPE_WEBHOOK_SECRET ontbreekt — handtekening NIET geverifieerd');
    }
  } catch (err) {
    console.error('[webhook] verificatie mislukt:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const order = {
      sessionId: session.id,
      bedrag: (session.amount_total / 100).toFixed(2),
      klant: session.customer_details?.name || '',
      email: session.customer_details?.email || '',
      telefoon: session.customer_details?.phone || '',
      adres: session.customer_details?.address || {},
      montage: session.metadata?.montage === 'ja' ? 'JA — contact opnemen voor prijsafspraak' : 'nee',
      bestelling: session.metadata?.overzicht || '',
    };
    console.log('[order] betaling geslaagd:', JSON.stringify(order));
    await stuurOrderMail(order).catch(e => console.error('[order] mail mislukt:', e.message));
  }

  res.json({ received: true });
});

async function stuurOrderMail(order) {
  if (!process.env.RESEND_API_KEY) return;
  const a = order.adres || {};
  const adresregel = [a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`.trim(), a.country]
    .filter(Boolean).join(', ');
  const html = `
    <h2>Nieuwe bestelling LumaDak — €${order.bedrag}</h2>
    <p><strong>Klant:</strong> ${order.klant}<br>
    <strong>E-mail:</strong> ${order.email}<br>
    <strong>Telefoon:</strong> ${order.telefoon || '—'}<br>
    <strong>Adres:</strong> ${adresregel || '—'}<br>
    <strong>Montage gewenst:</strong> ${order.montage}</p>
    <p><strong>Bestelling:</strong><br>${(order.bestelling || '').replace(/\n/g, '<br>')}</p>
    <p style="color:#888">Stripe session: ${order.sessionId}</p>`;

  // 3 pogingen met oplopende wachttijd (zelfde patroon als andere projecten)
  for (let poging = 1; poging <= 3; poging++) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'LumaDak <bestellingen@lumadak.nl>',
        to: ['info@lumadak.nl'],
        subject: `Nieuwe bestelling — €${order.bedrag} — ${order.klant}`,
        html,
      }),
    });
    if (resp.ok) return;
    console.warn(`[mail] poging ${poging} mislukt (${resp.status})`);
    if (poging < 3) await new Promise(r => setTimeout(r, poging * 2000));
  }
  throw new Error('Resend faalde na 3 pogingen');
}

// ---------- JSON-routes ----------

app.use(express.json());

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
        overzicht: overzicht.slice(0, 490), // metadata-limiet 500 tekens
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
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|css|js|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

app.get('/gezondheid', (_req, res) => res.json({ ok: true }));

app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`LumaDak draait op poort ${PORT}`);
  if (!stripe) console.warn('LET OP: STRIPE_SECRET_KEY niet gezet — afrekenen is uitgeschakeld.');
});
