// Inloggen, sessies en toegangscontrole.
//
// Sessies staan in Postgres (niet in het geheugen): een herstart van Railway
// gooit klanten er dan niet uit, en we kunnen een sessie desnoods intrekken.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const db = require('./db');

const KOSTEN = 12;                    // bcrypt-rondes; ~250ms per hash, bewust traag
const MIN_LENGTE = 8;

// Wie beheerder is, bepaalt een environment variable — geen vinkje in de
// database. Zo kan iemand met toegang tot de data zichzelf geen beheer geven.
function beheerderEmails() {
  return String(process.env.BEHEERDER_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

function isBeheerder(email) {
  const lijst = beheerderEmails();
  return lijst.length > 0 && lijst.includes(String(email || '').trim().toLowerCase());
}

// ---------- Wachtwoorden ----------

function keurWachtwoord(wachtwoord) {
  const w = String(wachtwoord || '');
  if (w.length < MIN_LENGTE) return `Kies een wachtwoord van minstens ${MIN_LENGTE} tekens.`;
  if (w.length > 200) return 'Dat wachtwoord is wel erg lang (maximaal 200 tekens).';
  return null;
}

async function hashWachtwoord(wachtwoord) {
  return bcrypt.hash(wachtwoord, KOSTEN);
}

async function controleerWachtwoord(wachtwoord, hash) {
  if (!hash) return false;
  return bcrypt.compare(wachtwoord, hash);
}

// ---------- Sessies ----------

function sessieMiddleware() {
  const geheim = process.env.SESSIE_GEHEIM;
  if (!geheim) {
    // Zonder vast geheim zou elke herstart alle sessies ongeldig maken.
    console.warn('[auth] SESSIE_GEHEIM ontbreekt — er wordt een tijdelijk geheim gebruikt, '
      + 'klanten worden bij elke herstart uitgelogd. Zet deze variabele op Railway.');
  }
  return session({
    name: 'lumadak_sessie',
    store: new PgSession({ pool: db.pool, tableName: 'sessies', createTableIfMissing: false }),
    secret: geheim || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,                                  // niet leesbaar vanuit JavaScript
      secure: process.env.NODE_ENV === 'production',   // alleen over https op Railway
      sameSite: 'lax',                                 // beschermt tegen CSRF vanaf andere sites
      maxAge: 30 * 24 * 60 * 60 * 1000,                // 30 dagen
    },
  });
}

// ---------- Toegang ----------

function huidigeKlant(req) {
  return req.session && req.session.klant ? req.session.klant : null;
}

function vereisLogin(req, res, next) {
  if (huidigeKlant(req)) return next();
  const terug = encodeURIComponent(req.originalUrl || '/account');
  res.redirect(`/inloggen?terug=${terug}`);
}

function vereisBeheerder(req, res, next) {
  const klant = huidigeKlant(req);
  if (klant && isBeheerder(klant.email)) return next();
  if (klant) return res.status(403).send('Geen toegang tot het beheerpaneel.');
  res.redirect('/inloggen?terug=%2Fbeheer');
}

function logIn(req, klant) {
  // Sessie-id verversen na inloggen (tegen session fixation), daarna pas vullen.
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.klant = { id: klant.id, email: klant.email, naam: klant.naam };
      req.session.csrf = crypto.randomBytes(24).toString('base64url');
      req.session.save(e => (e ? reject(e) : resolve()));
    });
  });
}

function logUit(req) {
  return new Promise(resolve => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

// ---------- CSRF ----------

// Sessiecookies zijn sameSite=lax, wat POSTs vanaf andere sites al blokkeert.
// Dit token is de tweede laag: elk formulier draagt hem mee.
function csrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('base64url');
  return req.session.csrf;
}

// Vergelijkt in constante tijd. timingSafeEqual eist gelijke lengtes, dus die
// controleren we eerst apart — een lengteverschil verraadt niets bruikbaars.
function veiligGelijk(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  if (A.length === 0 || A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function controleerCsrf(req, res, next) {
  const verwacht = req.session && req.session.csrf;
  const gekregen = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (veiligGelijk(verwacht, gekregen)) return next();
  res.status(403).send('Je sessie is verlopen. Ga terug, ververs de pagina en probeer het opnieuw.');
}

// ---------- Snelheidsbegrenzing ----------

// Simpele teller in het geheugen. De site draait op één Railway-instantie, dus
// dat volstaat; het doel is brute force op inloggen en reset afremmen.
const pogingen = new Map();

function begrens({ max, perSeconden, sleutel }) {
  const venster = perSeconden * 1000;
  return (req, res, next) => {
    const id = `${sleutel}:${ip(req)}`;
    const nu = Date.now();
    const rij = (pogingen.get(id) || []).filter(t => nu - t < venster);

    if (rij.length >= max) {
      const wacht = Math.ceil((venster - (nu - rij[0])) / 1000);
      res.set('Retry-After', String(wacht));
      return res.status(429).send(
        `Te veel pogingen. Probeer het over ${Math.ceil(wacht / 60)} minuten opnieuw.`);
    }

    rij.push(nu);
    pogingen.set(id, rij);
    next();
  };
}

function ip(req) {
  // Railway staat achter Cloudflare; de echte bezoeker staat vooraan in de keten.
  const door = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return door || req.ip || req.socket.remoteAddress || 'onbekend';
}

// Oude tellers opruimen zodat de Map niet eindeloos groeit.
setInterval(() => {
  const nu = Date.now();
  for (const [id, rij] of pogingen) {
    const levend = rij.filter(t => nu - t < 60 * 60 * 1000);
    if (levend.length) pogingen.set(id, levend); else pogingen.delete(id);
  }
}, 10 * 60 * 1000).unref();

module.exports = {
  MIN_LENGTE, isBeheerder, keurWachtwoord, hashWachtwoord, controleerWachtwoord,
  sessieMiddleware, huidigeKlant, vereisLogin, vereisBeheerder, logIn, logUit,
  csrfToken, controleerCsrf, begrens,
};
