FROM nginx:latest
USER non-root

COPY nginx.conf /etc/nginx/nginx.conf
COPY certs /etc/ssl/certs
RUN mkdir /var/cache/nginx/client_temp