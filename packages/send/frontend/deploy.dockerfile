# Production nginx image for the Send web app.
#
# This is NOT dockerfiles/Dockerfile-frontend: that one runs `vite dev` behind
# `pnpm --filter send-frontend run dev` and is a development server only. This
# image builds the SPA once and serves the static bundle from nginx, proxying
# /api, /trpc and the WebSocket endpoints to the backend so the whole app lives
# on one origin.
#
# THE BUILD CONTEXT IS THE REPO ROOT, not this directory (pnpm workspace):
#   docker build -f packages/send/frontend/deploy.dockerfile -t send-frontend .
#
# The build is deliberately ENV-AGNOSTIC: no `--mode`, no `.env`, nothing baked.
# The SPA is configured at RUNTIME from /config.js (see public/config.js and
# docker/docker-entrypoint.d/40-send-config.sh), so one built bundle is promoted
# unchanged across every environment. Baking values back in here would break the
# "empty string means unset" rule in src/config.ts: a runtime-empty APP_* value
# would silently fall back to whatever was baked.

# Pinned to the same Node the other Dockerfiles in this repo use.
FROM node:22.14.0 AS build

WORKDIR /app
RUN npm install -g pnpm@10

# Dependency manifests first so a source-only change does not bust the install
# layer. Every workspace member's package.json is needed: --frozen-lockfile
# validates the lockfile against all of them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml lerna.json nx.json .npmrc ./
COPY packages/send/package.json ./packages/send/
COPY packages/send/backend/package.json ./packages/send/backend/
COPY packages/send/frontend/package.json ./packages/send/frontend/
COPY packages/send/e2e/package.json ./packages/send/e2e/
COPY packages/addon/package.json ./packages/addon/

# --filter send-frontend: the backend, e2e and add-on packages are not needed to
# build the web app (the one backend import, `AppRouter`, is type-only and is
# elided by esbuild).
RUN pnpm install --frozen-lockfile --filter send-frontend

# Source is copied file-by-file rather than as a whole directory ON PURPOSE.
# There is no repo-root .dockerignore, so `COPY packages/send/frontend ...` would
# drag in a developer's local node_modules (wrong platform, and it would clobber
# the install above) and -- worse -- a local .env, which vite would bake into the
# bundle and silently defeat the runtime config. Listing the inputs makes both
# impossible.
COPY packages/send/frontend/index.html ./packages/send/frontend/
COPY packages/send/frontend/vite.config.js ./packages/send/frontend/
COPY packages/send/frontend/sharedViteConfig.ts ./packages/send/frontend/
COPY packages/send/frontend/csp.config.js ./packages/send/frontend/
COPY packages/send/frontend/postcss.config.js ./packages/send/frontend/
COPY packages/send/frontend/tailwind.config.cjs ./packages/send/frontend/
COPY packages/send/frontend/tsconfig.json ./packages/send/frontend/
COPY packages/send/frontend/tsconfig.client.base.json ./packages/send/frontend/
COPY packages/send/frontend/src ./packages/send/frontend/src
COPY packages/send/frontend/public ./packages/send/frontend/public

WORKDIR /app/packages/send/frontend

# Only the web app: `pnpm build` also builds the extension/management bundles and
# zips an XPI, which needs bun and is irrelevant to a server-side image. Note the
# absence of `--mode`: see the env-agnostic note at the top of this file.
RUN pnpm exec vite build --config vite.config.js

# Source maps are built (vite.config.js sets sourcemap: true) but are not shipped
# here: the ECS/S3 pipeline is what uploads them to Sentry, and serving them from
# a public origin hands out readable source. The nginx conf 404s *.map as well.
#
# The `//# sourceMappingURL=` comments have to go with them, or every devtools
# session on the pod 404s against that guard. Do NOT set `sourcemap: false` in
# the shared vite.config.js instead: the ECS/S3 pipeline needs the maps to upload
# to Sentry.
RUN find dist-web -name '*.map' -delete \
    && find dist-web -type f -name '*.js' \
       -exec sed -i '/^\/\/# sourceMappingURL=/d' {} +


FROM nginx:stable AS runtime

# jq: used by the runtime-config entrypoint to emit a JSON-escaped config.js.
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

# Replace the stock server block. Keeping the filename `default.conf` matters:
# the entrypoint script rewrites the proxy upstream in that exact path.
RUN rm /etc/nginx/conf.d/default.conf
COPY packages/send/frontend/docker/etc/nginx/conf.d/send.conf /etc/nginx/conf.d/default.conf

# Runtime config generator: nginx:stable runs /docker-entrypoint.d/*.sh at
# startup, before nginx, writing /usr/share/nginx/html/config.js from APP_* env.
COPY packages/send/frontend/docker/docker-entrypoint.d/40-send-config.sh /docker-entrypoint.d/40-send-config.sh
RUN chmod +x /docker-entrypoint.d/40-send-config.sh

COPY --from=build /app/packages/send/frontend/dist-web/ /usr/share/nginx/html/

# Catch a broken server block here instead of in a crash-looping pod. `nginx -t`
# resolves proxy_pass hostnames, and `send-backend` does not exist at build time,
# so validate a copy with the upstream swapped for a literal address. (That also
# means a pod started with APP_API_UPSTREAM unset fails loudly at boot rather than
# 502-ing every API call, which is the behaviour we want.)
RUN cp /etc/nginx/conf.d/default.conf /tmp/default.conf \
    && sed -i 's|send-backend:8080|127.0.0.1:65535|g' /etc/nginx/conf.d/default.conf \
    && nginx -t \
    && cp /tmp/default.conf /etc/nginx/conf.d/default.conf \
    && rm /tmp/default.conf

# Run unprivileged. `user nginx;` is dropped because it is meaningless (and warns)
# when the master process is not root, and the pid file has to move out of
# root-owned /run. The entrypoint needs to write config.js into the web root and
# sed the proxy upstream in conf.d, and nginx needs its temp dirs, hence the
# chowns.
#
# Both rewrites are ASSERTED. The pid path is matched on the directive rather
# than a literal path because the base image has used both /var/run/nginx.pid and
# /run/nginx.pid; a silently-missed substitution produces an image that builds
# fine and then dies at boot with `open() "/run/nginx.pid" failed (13)`.
RUN sed -i '/^user  *nginx;/d' /etc/nginx/nginx.conf \
    && sed -i -E 's|^(pid[[:space:]]+).*;|\1/tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && ! grep -qE '^user[[:space:]]' /etc/nginx/nginx.conf \
    && grep -qE '^pid[[:space:]]+/tmp/nginx\.pid;' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /etc/nginx/conf.d
USER nginx

# 8080, not 80: an unprivileged process cannot bind below 1024. The Service /
# target port must match (see `listen 8080` in docker/etc/nginx/conf.d/send.conf).
EXPOSE 8080
