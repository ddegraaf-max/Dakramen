-- LumaDak — basisschema: klanten, bestellingen, tokens.
-- Draait automatisch bij het opstarten van de server (zie db.js).

CREATE TABLE IF NOT EXISTS klanten (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  wachtwoord_hash  TEXT,                          -- NULL zolang de klant nog geen wachtwoord koos
  naam             TEXT NOT NULL DEFAULT '',
  telefoon         TEXT NOT NULL DEFAULT '',
  aangemaakt_op    TIMESTAMPTZ NOT NULL DEFAULT now(),
  laatste_login_op TIMESTAMPTZ
);

-- E-mail hoort hoofdletterongevoelig uniek te zijn: Jan@x.nl en jan@x.nl zijn
-- dezelfde klant. We slaan genormaliseerd op, deze index is de vangnetgarantie.
CREATE UNIQUE INDEX IF NOT EXISTS klanten_email_uniek ON klanten (lower(email));

-- Doorlopende teller voor het bestelnummer dat de klant te zien krijgt.
-- Bewust géén reset per jaar: nummers blijven zo gegarandeerd uniek.
CREATE SEQUENCE IF NOT EXISTS bestelnummer_seq START 1;

CREATE TABLE IF NOT EXISTS bestellingen (
  id                  SERIAL PRIMARY KEY,
  bestelnummer        TEXT NOT NULL UNIQUE,       -- bv. LD-2026-0001, wat de klant ziet
  klant_id            INTEGER NOT NULL REFERENCES klanten(id) ON DELETE RESTRICT,
  stripe_session_id   TEXT NOT NULL UNIQUE,       -- maakt de webhook idempotent
  bedrag_cent         INTEGER NOT NULL,
  verzendkosten_cent  INTEGER NOT NULL DEFAULT 0,
  montage             BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'betaald'
                      CHECK (status IN ('betaald','in_behandeling','verzonden','geleverd','geannuleerd')),
  naam                TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  telefoon            TEXT NOT NULL DEFAULT '',
  adres               JSONB NOT NULL DEFAULT '{}'::jsonb,
  notitie             TEXT NOT NULL DEFAULT '',   -- interne notitie vanuit het beheerpaneel
  aangemaakt_op       TIMESTAMPTZ NOT NULL DEFAULT now(),
  bijgewerkt_op       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bestellingen_klant_idx ON bestellingen (klant_id, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS bestellingen_status_idx ON bestellingen (status, aangemaakt_op DESC);

CREATE TABLE IF NOT EXISTS bestelregels (
  id              SERIAL PRIMARY KEY,
  bestelling_id   INTEGER NOT NULL REFERENCES bestellingen(id) ON DELETE CASCADE,
  product_id      INTEGER,
  product_naam    TEXT NOT NULL,
  aantal          INTEGER NOT NULL CHECK (aantal > 0),
  stuksprijs_cent INTEGER NOT NULL CHECK (stuksprijs_cent >= 0)
);

CREATE INDEX IF NOT EXISTS bestelregels_bestelling_idx ON bestelregels (bestelling_id);

-- Tokens voor "stel je wachtwoord in" (na een bestelling) en "wachtwoord vergeten".
-- We bewaren alleen de SHA-256 van het token: lekt de database, dan kan niemand
-- er een geldige link mee maken.
CREATE TABLE IF NOT EXISTS tokens (
  id           SERIAL PRIMARY KEY,
  klant_id     INTEGER NOT NULL REFERENCES klanten(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  doel         TEXT NOT NULL CHECK (doel IN ('instellen','reset')),
  verloopt_op  TIMESTAMPTZ NOT NULL,
  gebruikt_op  TIMESTAMPTZ,
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tokens_klant_idx ON tokens (klant_id, doel);

-- Sessietabel voor connect-pg-simple. Exact het schema dat die module verwacht.
CREATE TABLE IF NOT EXISTS sessies (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS sessies_expire_idx ON sessies (expire);
