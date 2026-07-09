# DakraamDirect — je Fakro-webwinkel

Deze map bevat je complete demo-webwinkel, nu voorbereid op je eigen foto's.

## Wat zit erin?

- **index.html** — de webwinkel zelf. Dubbelklik om te openen in je browser.
- **fotos/** — hierin zet je je productfoto's.
- **fotos/LEES-MIJ-fotonamen.txt** — de exacte bestandsnamen die elke foto moet krijgen.

## Hoe voeg ik mijn foto's toe?

1. Open het bestand `fotos/LEES-MIJ-fotonamen.txt`.
2. Daar staat per product welke bestandsnaam de foto moet hebben
   (bijvoorbeeld `ftp-v-78x118.jpg`).
3. Sla je foto op met precies die naam en zet hem in de map `fotos/`.
4. Open `index.html` opnieuw — de foto staat er meteen in.

Er staat al één **voorbeeldfoto** in de map (`ftp-v-78x118.jpg`) zodat je ziet
hoe het werkt. Vervang die door je eigen foto.

## En als een foto nog ontbreekt?

Geen probleem. Voor elk product waar nog geen foto bij zit, toont de winkel
automatisch een nette getekende illustratie. Er gaat dus nooit iets stuk —
je kunt rustig foto voor foto toevoegen.

## Waar haal ik de foto's vandaan?

- **Fakro-beeldbank**: log in met je dealer-/inkoopaccount bij Fakro of je
  groothandel en download de officiële productfoto's. Die mag je gebruiken
  omdat je hun producten verkoopt.
- **Zelf fotograferen**: vaak nog beter — klanten vertrouwen een echte foto
  van het product dat ze daadwerkelijk geleverd krijgen.

Gebruik geen foto's van internet zonder toestemming.

## Afrekenen via Stripe

De site rekent af via Stripe Checkout (iDEAL + kaart). Zie
RAILWAY-instructies.md voor het instellen van de Stripe-sleutels.
