# Two build arguments are possible, development and production.
# We use these to add contitional build differences.
ARG BUILD_ENV=production

FROM node:22.14.0 AS base

# Update packages
RUN apt update -y && apt upgrade -y

WORKDIR /app

# Copy only dependency manifests first so the install layer is only
# invalidated when deps change, not when source changes.
ADD package.json \
    tsconfig.json \
    ./

# build production — lockfile copied here via ONBUILD, then install runs
FROM base AS build_lockfile_production
ONBUILD RUN echo "Add pnpm-lock.yaml"
ONBUILD ADD pnpm-lock.yaml ./

# build development — no lockfile (resolved at workspace root)
FROM base AS build_lockfile_development
ONBUILD RUN echo "Don't add pnpm-lock.yaml"

FROM build_lockfile_${BUILD_ENV} AS build_app
RUN npm install -g pnpm@10.15.1
# prisma must be present before install: prisma's postinstall runs `prisma generate`
ADD prisma ./prisma
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --config.inject-workspace-packages=true; else pnpm install --no-frozen-lockfile; fi

# Remaining source copied AFTER install so source changes don't bust the dep layer cache.
ADD public ./public
ADD scripts ./scripts
ADD src ./src
ADD vitest.integration.config.js ./

# runtime production
FROM build_app AS runtime_production
# Set environment vartiable for runtime container user name
ENV runtime_user=send
# Add runtime user
ONBUILD RUN echo "Add runtime user"
ONBUILD RUN useradd -m ${runtime_user} -d /home/${runtime_user}
# Chown /app to runtime_user
ONBUILD RUN chown -Rf ${runtime_user} /app
# Switch to runtime user
ONBUILD USER ${runtime_user}

# runtime dev
FROM build_app AS runtime_development
ONBUILD RUN echo "Don't add runtime user"
ONBUILD RUN chown -Rvf node:node /app

FROM runtime_${BUILD_ENV}

CMD ["/bin/sh", "/app/scripts/entry.sh"]