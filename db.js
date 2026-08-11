// Databaselaag: verbinding, migraties en de queries die de winkel nodig heeft.
//
// Vereist DATABASE_URL (Railway zet die automatisch zodra je een Postgres
// toevoegt aan het project). Zonder die variabele start de site gewoon op,
// maar dan zonder klantaccounts — precies zoals hij zonder Stripe ook draait.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const AAN = Boolean(process.env.DATABASE_URL);

// Railway's interne verbinding heeft geen TLS nodig; de publieke proxy (die je
// lokaal gebruikt) wél. Vandaar de check op de hostnaam.
const pool = AAN
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /\.railway\.app|\.proxy\.rlwy\.net/.test(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : false,
      max: 5,
    })
  : null;

function beschikbaar() { return AAN; }

async function query(tekst, waarden) {
  if (!pool) throw new Error('Geen database geconfigureerd (DATABASE_URL ontbreekt).');
  return pool.query(tekst, waarden);
}

// ---------- Migraties ----------

async function migreer() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migraties (
      bestand      TEXT PRIMARY KEY,
      uitgevoerd_op TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const map = path.join(__dirname, 'migraties');
  const bestanden = fs.readdirSync(map).filter(b => b.endsWith('.sql')).sort();

  for (const bestand of bestanden) {
    const { rowCount } = await pool.query('SELECT 1 FROM schema_migraties WHERE bestand = $1', [bestand]);
    if (rowCount) continue;

    const sql = fs.readFileSync(path.join(map, bestand), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migraties (bestand) VALUES ($1)', [bestand]);
      await client.query('COMMIT');
      console.log(`[db] migratie uitgevoerd: ${bestand}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migratie ${bestand} mislukt: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

// ---------- Klanten ----------

function normaliseerEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Maakt de klant aan als hij nog niet bestaat, en vult ontbrekende naam/telefoon
// aan met wat Stripe ons gaf. Bestaande gegevens overschrijven we niet.
async function vindOfMaakKlant({ email, naam, telefoon }) {
  const e = normaliseerEmail(email);
  if (!e) throw new Error('E-mailadres ontbreekt.');

  const { rows } = await query(
    `INSERT INTO klanten (email, naam, telefoon)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET naam     = CASE WHEN klanten.naam     = '' THEN EXCLUDED.naam     ELSE klanten.naam     END,
           telefoon = CASE WHEN klanten.telefoon = '' THEN EXCLUDED.telefoon ELSE klanten.telefoon END
     RETURNING *`,
    [e, naam || '', telefoon || '']
  );
  return rows[0];
}

async function klantOpEmail(email) {
  const { rows } = await query('SELECT * FROM klanten WHERE lower(email) = $1', [normaliseerEmail(email)]);
  return rows[0] || null;
}

async function klantOpId(id) {
  const { rows } = await query('SELECT * FROM klanten WHERE id = $1', [id]);
  return rows[0] || null;
}

async function zetWachtwoord(klantId, hash) {
  await query('UPDATE klanten SET wachtwoord_hash = $1 WHERE id = $2', [hash, klantId]);
}

async function noteerLogin(klantId) {
  await query('UPDATE klanten SET laatste_login_op = now() WHERE id = $1', [klantId]);
}

// ---------- Bestellingen ----------

// Slaat bestelling + regels in één transactie op. Bestaat de Stripe-sessie al,
// dan geeft de functie de bestaande bestelling terug: Stripe mag een webhook
// gerust twee keer sturen zonder dat er een dubbele order ontstaat.
async function bewaarBestelling(gegevens) {
  const {
    klantId, stripeSessionId, bedragCent, verzendkostenCent,
    montage, naam, email, telefoon, adres, regels,
  } = gegevens;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bestaand = await client.query(
      'SELECT * FROM bestellingen WHERE stripe_session_id = $1', [stripeSessionId]
    );
    if (bestaand.rowCount) {
      await client.query('COMMIT');
      return { bestelling: bestaand.rows[0], nieuw: false };
    }

    const { rows } = await client.query(
      `INSERT INTO bestellingen
         (bestelnummer, klant_id, stripe_session_id, bedrag_cent, verzendkosten_cent,
          montage, naam, email, telefoon, adres)
       VALUES ('LD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('bestelnummer_seq')::text, 4, '0'),
               $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [klantId, stripeSessionId, bedragCent, verzendkostenCent || 0,
       Boolean(montage), naam || '', normaliseerEmail(email), telefoon || '',
       JSON.stringify(adres || {})]
    );
    const bestelling = rows[0];

    for (const r of regels || []) {
      await client.query(
        `INSERT INTO bestelregels (bestelling_id, product_id, product_naam, aantal, stuksprijs_cent)
         VALUES ($1, $2, $3, $4, $5)`,
        [bestelling.id, r.productId || null, r.naam, r.aantal, r.stuksprijsCent]
      );
    }

    await client.query('COMMIT');
    return { bestelling, nieuw: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function bestellingenVanKlant(klantId) {
  const { rows } = await query(
    `SELECT b.*,
            COALESCE(json_agg(json_build_object(
              'naam', r.product_naam, 'aantal', r.aantal, 'stuksprijs_cent', r.stuksprijs_cent
            ) ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS regels
       FROM bestellingen b
       LEFT JOIN bestelregels r ON r.bestelling_id = b.id
      WHERE b.klant_id = $1
      GROUP BY b.id
      ORDER BY b.aangemaakt_op DESC`,
    [klantId]
  );
  return rows;
}

async function alleBestellingen({ status, zoek } = {}) {
  const voorwaarden = [];
  const waarden = [];

  if (status) { waarden.push(status); voorwaarden.push(`b.status = $${waarden.length}`); }
  if (zoek) {
    waarden.push(`%${zoek.toLowerCase()}%`);
    voorwaarden.push(`(lower(b.bestelnummer) LIKE $${waarden.length}
                    OR lower(b.email) LIKE $${waarden.length}
                    OR lower(b.naam) LIKE $${waarden.length})`);
  }
  const waar = voorwaarden.length ? `WHERE ${voorwaarden.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT b.*,
            COALESCE(json_agg(json_build_object(
              'naam', r.product_naam, 'aantal', r.aantal, 'stuksprijs_cent', r.stuksprijs_cent
            ) ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS regels
       FROM bestellingen b
       LEFT JOIN bestelregels r ON r.bestelling_id = b.id
       ${waar}
      GROUP BY b.id
      ORDER BY b.aangemaakt_op DESC
      LIMIT 200`,
    waarden
  );
  return rows;
}

async function bestellingOpNummer(bestelnummer) {
  const { rows } = await query('SELECT * FROM bestellingen WHERE bestelnummer = $1', [bestelnummer]);
  return rows[0] || null;
}

async function wijzigStatus(bestellingId, status) {
  const { rows } = await query(
    `UPDATE bestellingen SET status = $1, bijgewerkt_op = now()
      WHERE id = $2 RETURNING *`,
    [status, bestellingId]
  );
  return rows[0] || null;
}

async function zetNotitie(bestellingId, notitie) {
  await query('UPDATE bestellingen SET notitie = $1, bijgewerkt_op = now() WHERE id = $2',
    [String(notitie || '').slice(0, 2000), bestellingId]);
}

// ---------- Tokens ----------

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Geeft het onversleutelde token terug (dat gaat in de e-maillink); in de
// database belandt alleen de hash.
async function maakToken(klantId, doel, geldigMinuten) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO tokens (klant_id, token_hash, doel, verloopt_op)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [klantId, hashToken(token), doel, String(geldigMinuten)]
  );
  return token;
}

async function bekijkToken(token) {
  const { rows } = await query(
    `SELECT t.*, k.email, k.naam
       FROM tokens t JOIN klanten k ON k.id = t.klant_id
      WHERE t.token_hash = $1 AND t.gebruikt_op IS NULL AND t.verloopt_op > now()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function verbruikToken(token) {
  const { rowCount } = await query(
    `UPDATE tokens SET gebruikt_op = now()
      WHERE token_hash = $1 AND gebruikt_op IS NULL AND verloopt_op > now()`,
    [hashToken(token)]
  );
  return rowCount === 1;
}

// Oude, nog openstaande tokens voor hetzelfde doel intrekken, zodat er per klant
// altijd maar één geldige link rondgaat.
async function trekTokensIn(klantId, doel) {
  await query(
    `UPDATE tokens SET gebruikt_op = now()
      WHERE klant_id = $1 AND doel = $2 AND gebruikt_op IS NULL`,
    [klantId, doel]
  );
}

module.exports = {
  pool, beschikbaar, query, migreer,
  vindOfMaakKlant, klantOpEmail, klantOpId, zetWachtwoord, noteerLogin,
  bewaarBestelling, bestellingenVanKlant, alleBestellingen, bestellingOpNummer,
  wijzigStatus, zetNotitie,
  maakToken, bekijkToken, verbruikToken, trekTokensIn,
};
