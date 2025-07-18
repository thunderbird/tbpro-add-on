# Two build arguments are possible, development and production.
# We use these to add contitional build differences.
ARG BUILD_ENV=production

FROM node:22.14.0 AS base

# Update packages
RUN apt update -y && apt upgrade -y

FROM base AS build_lockfile_production
ONBUILD RUN echo "Add pnpm-lock.yaml"
ONBUILD ADD pnpm-lock.yaml ./

FROM base AS build_lockfile_development
# We don't copy the lockfile during development 
# because we resolve our dependencies at the root
ONBUILD RUN echo "Don't add pnpm-lock.yaml"

FROM build_lockfile_${BUILD_ENV} AS build_app

WORKDIR /app
ADD package.json \
    tsconfig.json \
    ./

ADD prisma ./prisma
ADD public ./public
ADD scripts ./scripts
ADD src ./src

RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile

# If we are adding a runtime user
FROM build_app AS runtime_production
ENV runtime_user=send
# Add runtime user
ONBUILD RUN echo "Add runtime user '$send'"
ONBUILD RUN useradd ${runtime_user} -d /home/${runtime_user}
# Chown /app to runtime_user
ONBUILD RUN chown -Rvf ${runtime_user} /app
# Switch to runtime user
ONBUILD USER ${runtime_user}

# If we are not adding a runtime user
FROM build_app AS runtime_development
ONBUILD RUN echo "Don't add runtime user"
ONBUILD RUN chown -Rvf node:node /app

FROM runtime_${BUILD_ENV}

CMD ["/bin/sh", "/app/scripts/entry.sh"]