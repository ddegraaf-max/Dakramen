# LumaDak → WooCommerce: stap-voor-stap

Een complete routekaart om van je huidige statische winkel naar een echte verkopende
webshop te gaan, met iDEAL-betaling via Mollie.

---

## Wat je gaat krijgen

Een werkende webshop op je eigen domein (lumadak.nl), waar klanten:
- Kunnen rondkijken in je Fakro-assortiment
- Kunnen afrekenen met iDEAL
- Een bevestigingsmail krijgen
- Hun bestelling kunnen volgen

En jij als eigenaar:
- Krijgt elke bestelling automatisch per e-mail
- Beheert voorraad en bestellingen vanuit één dashboard
- Kunt makkelijk producten toevoegen/wijzigen

---

## Wat heb je nodig?

### Eenmalige kosten
- **Domeinnaam lumadak.nl** — circa €10–15 per jaar
- **Hosting** — circa €5–15 per maand (managed WordPress aanbevolen)

### Per bestelling
- **Mollie iDEAL** — ongeveer €0,29–€0,32 per transactie, geen vaste maandkosten

### Gratis
- WordPress, WooCommerce, Mollie-plugin

---

## Stap 1: Domeinnaam registreren

Ga naar TransIP, Hostnet, Mijndomein of een andere Nederlandse registrar.
Registreer **lumadak.nl**. Kost je een paar minuten.

> Tip: registreer ook lumadak.com en lumadak.eu om merkbescherming te hebben,
> die kun je later doorlinken naar je hoofdsite.

---

## Stap 2: Hosting kiezen en WordPress installeren

Kies een hoster die "managed WordPress hosting" aanbiedt — dan staat alles
al voor je klaar. Goede Nederlandse opties:

- **TransIP** (Stack/WP-pakket)
- **Hostnet** (WordPress Premium)
- **Antagonist** (WordPress hosting)
- **Yourhosting** of **Vimexx** (budgetvriendelijk)

Bij de aanmelding kies je vaak meteen "WordPress installeren" — meestal
één klik. Daarna krijg je inloggegevens voor het WordPress-dashboard
(meestal op `lumadak.nl/wp-admin`).

---

## Stap 3: WooCommerce activeren

In het WordPress-dashboard:

1. Ga naar **Plugins → Nieuwe toevoegen**
2. Zoek "WooCommerce"
3. Klik **Installeren** en daarna **Activeren**
4. WooCommerce start automatisch een setup-wizard. Vul in:
   - Bedrijf: Creditline B.V.
   - Adres: Torenlaan 5A, 1402 AT Bussum
   - Valuta: Euro (€)
   - Verkoop je fysieke of digitale producten? **Fysieke producten**

---

## Stap 4: Producten importeren met de CSV

Dit is waar het CSV-bestand `lumadak-producten-woocommerce.csv` binnenkomt.

1. Ga in WordPress naar **Producten → Alle producten**
2. Klik bovenaan op **Importeren**
3. Kies het bestand `lumadak-producten-woocommerce.csv`
4. Klik **Doorgaan**
5. WooCommerce toont een kolommen-mapping. Meestal klopt alles automatisch
   (omdat ik de officiële kolomnamen heb gebruikt). Controleer:
   - **SKU**, **Naam**, **Reguliere prijs**, **Categorieën** kloppen
   - **Afbeeldingen** wijst naar de juiste URL
6. Klik **Importeren starten**

Klaar — alle 14 producten staan erin, inclusief categorieën en aanbiedingsprijzen.

> **Belangrijk over afbeeldingen:** de CSV verwijst naar
> `https://www.lumadak.nl/wp-content/uploads/fakro/[bestandsnaam].jpg`.
> Die foto's moet je eerst uploaden naar WordPress (Media → Toevoegen) of
> later per product handmatig instellen. Als je nog geen foto's hebt, kun
> je deze kolom in de CSV leeg laten en later per product invullen.

---

## Stap 5: Mollie koppelen voor iDEAL

1. Maak een gratis account aan op **mollie.com**. Doorloop het verificatieproces
   (KvK, IBAN, identiteitsbewijs). Dit duurt soms 1–2 dagen.
2. In WordPress: **Plugins → Nieuwe toevoegen** → zoek "Mollie Payments for WooCommerce"
3. Installeer en activeer.
4. Ga naar **WooCommerce → Instellingen → Betalingen → Mollie**
5. Plak je Mollie API-sleutel (uit je Mollie-dashboard onder Ontwikkelaars → API-sleutels)
6. Schakel **iDEAL** in. Eventueel ook Bancontact, creditcard, PayPal.

Test direct met een echte iDEAL-betaling van €0,01 op jezelf om te zien
dat alles werkt.

---

## Stap 6: Verzending instellen (eigen bezorging)

1. **WooCommerce → Instellingen → Verzending**
2. Maak een verzendzone "Nederland"
3. Voeg twee verzendmethodes toe:
   - **"Eigen bezorging op afspraak"** → vast bedrag (bijv. €25) of €0 als je
     het altijd in overleg doet
   - **"Ophalen op afspraak"** → €0
4. Sla op.

---

## Stap 7: De winkel-uitstraling overzetten

Je hebt nu een werkende webshop, maar met een standaard WordPress-thema.
Om de LumaDak-uitstraling (logo, kleuren, layout) terug te krijgen heb je
twee opties:

### Optie A: Standaard thema aanpassen (snelst)
Gebruik het gratis thema **"Storefront"** of **"Astra"** en pas de kleuren aan:
- Primaire kleur: **#e8b53d** (goud)
- Tekstkleur: **#1f2329** (antraciet)
- Upload je logo via **Weergave → Aanpassen → Site-identiteit**

### Optie B: Maatwerk thema (mooist, kost meer werk)
Laat de huidige LumaDak-site door een ontwikkelaar omzetten naar een
WordPress-thema. Reken op een paar honderd tot duizend euro, afhankelijk
van wensen.

### Optie C: Pagebuilder (compromis)
Gebruik **Elementor** (gratis basisversie) om de homepage opnieuw op
te bouwen in je huisstijl, met dezelfde elementen als je huidige site
(hero, USP-balk, productgrid, keuzehulp, montagesectie, footer).

---

## Stap 8: Juridische pagina's toevoegen

Maak in **Pagina's → Nieuw** drie pagina's:
- Algemene voorwaarden
- Privacyverklaring
- Retourneren

Plak de teksten uit de bestanden in de map `voorwaarden/`. Voeg ze toe
aan het footer-menu via **Weergave → Menu's**.

> **Niet vergeten:** laat deze teksten vóór livegang controleren door een
> jurist of een dienst zoals voorbeeld.com / juridischloket.

---

## Stap 9: Testen, testen, testen

Vóór je live gaat:
- [ ] Een test-bestelling plaatsen met een echte iDEAL-betaling
- [ ] Controleren dat je een bevestigingsmail krijgt op info@lumadak.nl
- [ ] Controleren dat de klant ook een mail krijgt
- [ ] Telefoonnummer en e-mail kloppen op de hele site
- [ ] Bedrijfsgegevens (KVK, BTW) staan in voorwaarden én footer
- [ ] Alle productfoto's zijn ingesteld
- [ ] Mobiele weergave werkt goed
- [ ] SSL-certificaat actief (groen slotje in de browser)

---

## Stap 10: Live gaan

Zodra alles werkt:
1. Stel je DNS in zodat lumadak.nl wijst naar je hosting (regelt je hoster meestal)
2. Geef vrienden/familie het adres voor een laatste check
3. Begin met promotie (Google Ads, social media, mond-tot-mondreclame)

---

## Hulp nodig onderweg?

Bij elke stap kun je het volgende doen:
- **Hoster-support** is meestal Nederlandstalig en helpt met installatie
- **WooCommerce-documentatie** op woocommerce.com/documentation
- **Mollie-support** op help.mollie.com — Nederlandstalig, snel
- Of vraag mij gerust om hulp bij specifieke stappen

---

## Wat zit er in deze ZIP?

```
fakro-shop/
├── index.html                          (de demo-winkel — als blauwdruk)
├── logo.png, logo-footer.png           (logo-bestanden)
├── lumadak-producten-woocommerce.csv   ← DIT IS DE IMPORT VOOR WOOCOMMERCE
├── LEES-MIJ-eerst.md                   (algemene leesmij)
├── WOOCOMMERCE-stappenplan.md          (dit bestand)
├── fotos/                              (jouw productfoto's hier)
│   └── LEES-MIJ-fotonamen.txt
└── voorwaarden/                        (juridische teksten + PDF's)
    ├── algemene-voorwaarden.html / .pdf
    ├── privacy.html / .pdf
    └── retourneren.html / .pdf
```

Succes met de lancering!
