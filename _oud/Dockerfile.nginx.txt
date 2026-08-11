# Nginx-container voor Railway, luistert op de poort uit $PORT.
# Gebaseerd op de officiele nginx:alpine envsubst-feature.
FROM nginx:alpine

# Verwijder standaard nginx-config; we leveren onze eigen via templates
RUN rm -f /etc/nginx/conf.d/default.conf

# Kopieer alle sitebestanden naar de webroot
COPY . /usr/share/nginx/html

# Plaats template in /etc/nginx/templates/ -- het nginx entrypoint vervangt
# ${PORT} automatisch en plaatst het resultaat in /etc/nginx/conf.d/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Fallback voor PORT als Railway hem onverhoopt niet meegeeft
ENV PORT=80
