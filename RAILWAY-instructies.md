# Railway-deployment — LumaDak met Stripe

## Wat is er veranderd (juli 2026)

De site is omgezet van statische nginx (Docker) naar **Node.js/Express** —
dezelfde opzet als je andere projecten. Reden: voor Stripe Checkout is een
server nodig die de betaalsessie aanmaakt en de prijzen valideert.

- `server.js` — serveert de site + `/api/checkout` + `/api/stripe-webhook`
- `producten.js` — de productcatalogus, gedeeld tussen site en server
  (prijzen worden dus altijd server-side gecontroleerd, nooit uit de browser)
- `package.json` — Railway herkent dit automatisch (geen Dockerfile meer nodig)
- Dockerfile en nginx.conf.template zijn verwijderd

## Deployen (zelfde werkwijze als altijd)

1. Upload de bestanden naar de GitHub-repo `Dakramen` (root, geen submap)
2. Railway bouwt en deployt automatisch — hij detecteert Node via package.json
3. Was de Target Port eerder handmatig op 80 gezet? Zet die instelling dan
   terug/leeg (Settings → Networking): de server luistert nu op Railway's $PORT

## Stripe instellen

### 1. Environment variables (Railway → service → Variables)

| Variable | Waarde | Verplicht |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (testen) of `sk_live_...` (live) | Ja |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` — zie stap 3 | Aanbevolen |
| `RESEND_API_KEY` | Voor orderbevestiging naar info@lumadak.nl | Optioneel |
| `SITE_URL` | `https://lumadak.nl` (of het .up.railway.app-adres) | Aanbevolen |

Zonder STRIPE_SECRET_KEY draait de site gewoon, maar geeft de knop
"Bestelling plaatsen" een nette foutmelding dat betalen nog niet actief is.

### 2. Sleutels ophalen

Stripe Dashboard → Developers → API keys. Begin met de **testmodus**
(sk_test_...) en test met iDEAL-testbank of kaart 4242 4242 4242 4242.

### 3. Webhook aanmaken (voor orderbevestiging)

Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://<jouw-domein>/api/stripe-webhook`
- Event: `checkout.session.completed`
- Kopieer de "Signing secret" (whsec_...) naar `STRIPE_WEBHOOK_SECRET`

Bij elke geslaagde betaling logt de server de order, en als RESEND_API_KEY
is gezet, gaat er een ordermail naar info@lumadak.nl met klantgegevens,
adres, telefoonnummer, bestelregels en de montage-wens.

### 4. iDEAL activeren

Stripe Dashboard → Settings → Payment methods → iDEAL aanzetten
(in testmodus staat hij meestal al aan). De checkout toont iDEAL en kaart.

## Hoe de betaling werkt

1. Klant klikt "Bestelling plaatsen" → browser stuurt alleen product-id's
   en aantallen naar `/api/checkout`
2. Server zoekt de prijzen op in `producten.js`, rekent verzendkosten
   (€25 per dakraam, toebehoren/zonwering gratis) en maakt de Stripe-sessie
3. Klant rekent af op de Stripe-pagina (iDEAL/kaart, NL/BE adres, telefoon)
4. Geslaagd → `/bedankt.html` (winkelwagen wordt geleegd)
   Geannuleerd → terug naar de winkel, winkelwagen blijft staan
5. Stripe stuurt de webhook → server logt de order en mailt (indien ingesteld)

## Testchecklist vóór livegang

- [ ] Testbetaling met iDEAL-testbank afronden → kom je op /bedankt.html?
- [ ] Order verschijnt in Stripe Dashboard → Payments
- [ ] Webhook: ordermail ontvangen op info@lumadak.nl (of zichtbaar in logs)
- [ ] Betaling annuleren → winkelwagen staat nog vol
- [ ] Montage-vinkje aan → staat "montage: JA" in de ordermail/metadata
- [ ] Daarna: sk_test_ vervangen door sk_live_ en webhook opnieuw
      aanmaken in live-modus (webhook secrets verschillen per modus!)

## Eindcheck domein

- Railway-domain (.up.railway.app) toont de site
- Settings → Networking → Custom Domain: lumadak.nl (CNAME bij registrar)
- Zet daarna SITE_URL op https://lumadak.nl
