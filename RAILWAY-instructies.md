# Railway-deployment: poortprobleem oplossen

## De voortgang tot nu toe

- Eerste poging: Railway kon niets bouwen (submap-probleem). OPGELOST.
- Tweede poging: mijn Dockerfile had een bug met /etc/nginx/templates. OPGELOST.
- Derde poging: build is gelukt, maar "Application failed to respond".
  Reden: nginx luisterde op poort 80, Railway probeerde op zijn eigen $PORT.

## Twee opties om dit op te lossen

### Optie A: Snelste fix -- in Railway zelf (probeer dit eerst)

1. Ga in Railway naar je service
2. Klik op **Settings** -> **Networking**
3. Bij de gegenereerde domain, klik op het potlood/edit-icoon
4. Bij **Target Port** vul je **80** in
5. Sla op

Railway routeert verkeer nu correct naar poort 80 in de container.
Refresh het Railway-domein in je browser en de site zou moeten werken.

GEEN nieuwe upload nodig met deze optie.

### Optie B: Nieuwe Dockerfile (als Optie A niet werkt)

In deze ZIP zit een verbeterde versie waarin nginx wel op $PORT luistert.
De wijzigingen:

- **nginx.conf.template** -- de nginx-config met ${PORT} als variabele
- **Dockerfile** -- gebruikt de ingebouwde envsubst-feature van nginx:alpine

De `nginx:alpine` image heeft een ingebouwd entrypoint-script dat
automatisch alle .template-bestanden in /etc/nginx/templates/ verwerkt
met envsubst voordat nginx start. Daarmee wordt ${PORT} vervangen door
de echte poort die Railway meegeeft, en luistert nginx op de juiste plek.

Upload de nieuwe bestanden naar GitHub (zelfde methode als eerder).

## Eindcheck

Als alles werkt:
- Railway-domain (.up.railway.app) toont je LumaDak-site
- Settings -> Networking -> Custom Domain: voeg lumadak.nl toe
- Railway geeft een CNAME-waarde, die je instelt bij je domeinregistrar
