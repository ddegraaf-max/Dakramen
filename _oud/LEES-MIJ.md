# Oude nginx-opzet (niet meer in gebruik)

Deze drie bestanden hoorden bij de eerste versie van de site: een statische
nginx-container. Ze zijn hierheen verplaatst en hernoemd — **niet verwijderd** —
zodat je ze kunt teruglezen, maar Railway ze niet meer oppakt.

| Nu | Was |
|---|---|
| `Dockerfile.nginx.txt` | `Dockerfile` |
| `nginx.conf.template.txt` | `nginx.conf.template` |
| `dockerignore.txt` | `.dockerignore` |

## Waarom weg uit de hoofdmap?

Railway bouwt **altijd** met een Dockerfile zodra hij er één in de hoofdmap
vindt — ook als er een `package.json` naast ligt. Daardoor draaide de site nog
op de oude statische nginx en niet op `server.js`, met als gevolg dat
`/api/checkout` een 405 gaf en afrekenen met Stripe onmogelijk was.

Nu er geen `Dockerfile` meer in de hoofdmap staat, detecteert Railway Node via
`package.json` en start hij `npm start` → `server.js`. Daarmee werken de
Stripe-checkout, de webhook en de no-cache-headers op `producten.js` wél.

## Terugdraaien?

Verplaats `Dockerfile.nginx.txt` terug naar de hoofdmap als `Dockerfile` en
Railway schakelt bij de volgende deploy weer over op nginx. De site blijft dan
werken, maar afrekenen valt weer uit.
