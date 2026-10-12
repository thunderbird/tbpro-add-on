# Pinned to the same nginx as packages/send/frontend/deploy.dockerfile.
FROM nginx:1.28.3

COPY nginx.conf /etc/nginx/nginx.conf
COPY certs /etc/ssl/certs
# Run unprivileged: both listen ports are above 1024, nginx.conf keeps its pid
# file in /tmp, and nginx needs to own its temp dirs.
RUN mkdir -p /var/cache/nginx/client_temp \
    && chown -R nginx:nginx /var/cache/nginx
USER nginx
