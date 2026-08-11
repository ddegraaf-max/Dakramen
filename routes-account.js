// Klantroutes: inloggen, uitloggen, wachtwoord instellen/vergeten, bestellingen.

const express = require('express');
const db = require('./db');
const auth = require('./auth');
const mail = require('./mail');
const views = require('./views');

const router = express.Router();

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

// Alleen paden binnen de eigen site accepteren als "waar kwam je vandaan",
// anders is dit een open redirect naar een willekeurige externe site.
function veiligTerug(waarde) {
  const t = String(waarde || '');
  return /^\/[^/\\]/.test(t) ? t : '/account';
}

// ---------- Inloggen ----------

router.get('/inloggen', (req, res) => {
  if (auth.huidigeKlant(req)) return res.redirect('/account');
  res.send(views.inloggen({
    terug: veiligTerug(req.query.terug),
    csrf: auth.csrfToken(req),
    gelukt: req.query.uitgelogd ? 'Je bent uitgelogd.' : null,
  }));
});

router.post('/inloggen',
  auth.begrens({ max: 10, perSeconden: 900, sleutel: 'inloggen' }),
  auth.controleerCsrf,
  async (req, res) => {
    const { email, wachtwoord } = req.body || {};
    const terug = veiligTerug(req.body.terug);

    const toon = (fout) => res.status(401).send(views.inloggen({
      fout, email, terug, csrf: auth.csrfToken(req),
    }));

    try {
      const klant = await db.klantOpEmail(email);
      const goed = klant && await auth.controleerWachtwoord(wachtwoord, klant.wachtwoord_hash);

      // Eén boodschap voor "onbekend adres" én "fout wachtwoord": anders kun je
      // via dit formulier uitvinden wie er klant is.
      if (!goed) return toon('E-mailadres of wachtwoord klopt niet.');

      if (!klant.wachtwoord_hash) {
        return toon('Voor dit account is nog geen wachtwoord ingesteld. Gebruik de link uit je bestelmail of vraag een nieuwe aan.');
      }

      await auth.logIn(req, klant);
      await db.noteerLogin(klant.id);
      res.redirect(terug);
    } catch (err) {
      console.error('[inloggen] fout:', err.message);
      toon('Er ging iets mis. Probeer het opnieuw.');
    }
  });

router.post('/uitloggen', async (req, res) => {
  await auth.logUit(req);
  res.redirect('/inloggen?uitgelogd=1');
});

// ---------- Wachtwoord vergeten ----------

router.get('/wachtwoord-vergeten', (req, res) => {
  res.send(views.wachtwoordVergeten({ csrf: auth.csrfToken(req) }));
});

router.post('/wachtwoord-vergeten',
  auth.begrens({ max: 5, perSeconden: 900, sleutel: 'reset' }),
  auth.controleerCsrf,
  async (req, res) => {
    const bevestiging = 'Als dit adres bij ons bekend is, staat er nu een e-mail met een link voor je klaar. '
      + 'Kijk ook even in je spamfolder.';

    try {
      const klant = await db.klantOpEmail(req.body.email);
      if (klant) {
        await db.trekTokensIn(klant.id, 'reset');
        const token = await db.maakToken(klant.id, 'reset', 60);
        const link = `${siteUrl(req)}/wachtwoord-instellen?token=${encodeURIComponent(token)}`;
        const bericht = mail.wachtwoordReset(klant.naam, link);
        await mail.verstuur({ to: klant.email, ...bericht });
      }
    } catch (err) {
      console.error('[reset] fout:', err.message);
    }

    // Altijd dezelfde melding, of het adres nu bestaat of niet.
    res.send(views.wachtwoordVergeten({ gelukt: bevestiging, csrf: auth.csrfToken(req) }));
  });

// ---------- Wachtwoord instellen ----------

router.get('/wachtwoord-instellen', async (req, res) => {
  const token = String(req.query.token || '');
  try {
    const rij = await db.bekijkToken(token);
    if (!rij) {
      return res.status(400).send(views.wachtwoordVergeten({
        fout: 'Deze link is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.',
        csrf: auth.csrfToken(req),
      }));
    }
    res.send(views.wachtwoordInstellen({
      token, nieuw: rij.doel === 'instellen',
      minLengte: auth.MIN_LENGTE, csrf: auth.csrfToken(req),
    }));
  } catch (err) {
    console.error('[instellen] fout:', err.message);
    res.status(500).send('Er ging iets mis. Probeer het later opnieuw.');
  }
});

router.post('/wachtwoord-instellen',
  auth.begrens({ max: 10, perSeconden: 900, sleutel: 'instellen' }),
  auth.controleerCsrf,
  async (req, res) => {
    const { token, wachtwoord, herhaal } = req.body || {};

    const toon = (fout) => res.status(400).send(views.wachtwoordInstellen({
      fout, token, nieuw: true, minLengte: auth.MIN_LENGTE, csrf: auth.csrfToken(req),
    }));

    try {
      const rij = await db.bekijkToken(String(token || ''));
      if (!rij) {
        return res.status(400).send(views.wachtwoordVergeten({
          fout: 'Deze link is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.',
          csrf: auth.csrfToken(req),
        }));
      }

      if (wachtwoord !== herhaal) return toon('De twee wachtwoorden zijn niet gelijk.');
      const bezwaar = auth.keurWachtwoord(wachtwoord);
      if (bezwaar) return toon(bezwaar);

      // Token pas verbruiken als het wachtwoord goedgekeurd is, en de uitkomst
      // controleren: twee gelijktijdige verzoeken mogen niet allebei slagen.
      const verbruikt = await db.verbruikToken(String(token));
      if (!verbruikt) return toon('Deze link is zojuist al gebruikt. Vraag een nieuwe aan.');

      const hash = await auth.hashWachtwoord(wachtwoord);
      await db.zetWachtwoord(rij.klant_id, hash);

      const klant = await db.klantOpId(rij.klant_id);
      await auth.logIn(req, klant);
      await db.noteerLogin(klant.id);
      res.redirect('/account?ingesteld=1');
    } catch (err) {
      console.error('[instellen] fout:', err.message);
      toon('Er ging iets mis. Probeer het opnieuw.');
    }
  });

// ---------- Bestellingen ----------

router.get('/account', auth.vereisLogin, async (req, res) => {
  const klant = auth.huidigeKlant(req);
  try {
    const bestellingen = await db.bestellingenVanKlant(klant.id);
    res.send(views.account({
      klant, bestellingen,
      beheerder: auth.isBeheerder(klant.email),
      gelukt: req.query.ingesteld ? 'Je wachtwoord is ingesteld. Welkom!' : null,
    }));
  } catch (err) {
    console.error('[account] fout:', err.message);
    res.status(500).send('Er ging iets mis bij het ophalen van je bestellingen.');
  }
});

module.exports = router;
