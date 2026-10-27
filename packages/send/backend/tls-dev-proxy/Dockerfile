# Pinned to the same nginx as packages/send/frontend/deploy.dockerfile.
FROM nginx:1.28.3

COPY nginx.conf /etc/nginx/nginx.conf
# The TLS cert and key are generated at container start (see the script), not
# committed, into /etc/nginx/tls, which the nginx user owns.
COPY docker-entrypoint.d/05-dev-tls-cert.sh /docker-entrypoint.d/
# Run unprivileged: both listen ports are above 1024, nginx.conf keeps its pid
# file in /tmp, and nginx needs to own its temp dirs and the cert dir.
RUN chmod +x /docker-entrypoint.d/05-dev-tls-cert.sh \
    && mkdir -p /var/cache/nginx/client_temp /etc/nginx/tls \
    && chown -R nginx:nginx /var/cache/nginx /etc/nginx/tls
USER nginx
