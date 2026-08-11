// Beheerpaneel: bestellingen bekijken, status wijzigen, klant informeren.
// Alleen bereikbaar voor adressen uit BEHEERDER_EMAILS (zie auth.js).

const express = require('express');
const db = require('./db');
const auth = require('./auth');
const mail = require('./mail');
const views = require('./views');

const router = express.Router();

const STATUSSEN = ['betaald', 'in_behandeling', 'verzonden', 'geleverd', 'geannuleerd'];

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

async function tellingen() {
  const { rows } = await db.query(
    `SELECT status, count(*)::int AS n FROM bestellingen GROUP BY status`);
  const uit = { totaal: 0 };
  for (const r of rows) { uit[r.status] = r.n; uit.totaal += r.n; }
  return uit;
}

router.get('/beheer', auth.vereisBeheerder, async (req, res) => {
  const status = STATUSSEN.includes(req.query.status) ? req.query.status : '';
  const zoek = String(req.query.zoek || '').trim().slice(0, 80);

  try {
    const [bestellingen, aantallen] = await Promise.all([
      db.alleBestellingen({ status: status || undefined, zoek: zoek || undefined }),
      tellingen(),
    ]);

    res.send(views.beheer({
      klant: auth.huidigeKlant(req),
      bestellingen, status, zoek, aantallen,
      csrf: auth.csrfToken(req),
      gelukt: req.query.opgeslagen ? 'Status bijgewerkt.' : null,
      fout: req.query.fout ? 'Wijzigen is niet gelukt.' : null,
    }));
  } catch (err) {
    console.error('[beheer] fout:', err.message);
    res.status(500).send('Er ging iets mis bij het ophalen van de bestellingen.');
  }
});

router.post('/beheer/status', auth.vereisBeheerder, auth.controleerCsrf, async (req, res) => {
  const id = Number(req.body.id);
  const status = String(req.body.status || '');
  const mailen = req.body.mail === '1';

  if (!Number.isInteger(id) || !STATUSSEN.includes(status)) {
    return res.redirect('/beheer?fout=1');
  }

  try {
    const bestelling = await db.wijzigStatus(id, status);
    if (!bestelling) return res.redirect('/beheer?fout=1');

    // De klant mailen mag nooit de statuswijziging zelf laten mislukken:
    // de wijziging staat al vast, de mail is een extra.
    if (mailen && bestelling.email) {
      const bericht = mail.statusUpdate(bestelling, siteUrl(req));
      mail.verstuur({ to: bestelling.email, ...bericht })
        .catch(e => console.error('[beheer] statusmail mislukt:', e.message));
    }

    res.redirect('/beheer?opgeslagen=1');
  } catch (err) {
    console.error('[beheer] status wijzigen mislukt:', err.message);
    res.redirect('/beheer?fout=1');
  }
});

module.exports = router;
