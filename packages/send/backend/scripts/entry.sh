#!/bin/sh

# Fail closed. This script previously had no `set -e`, so a failed
# `prisma migrate deploy` was silently swallowed and the server booted anyway
# against a possibly-unmigrated schema (tbpro-add-on#1069). With `set -e` any
# non-zero command aborts container start instead of falling through to a
# running server in a half-initialised state.
set -e

# CI-only: the e2e harness drives this image and needs workspace deps installed
# at boot. Normal images already have deps baked in by the Dockerfile.
if [ "$IS_CI_AUTOMATION" != "yes" ]; then
    echo 'Skipping lockfile install on CI'
else
    echo 'installing backend deps'
    pnpm install --frozen-lockfile
fi

if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting with NODE_ENV on production'
fi

# Migrations are OFF by default and opt-in via RUN_MIGRATIONS_ON_BOOT=true.
#
# WHY: on EKS, migrations run as a dedicated Kargo/ArgoCD Sync-phase Job at wave
# 0 (send-deploy: bases/send/migrate-job.yaml, command `pnpm db:update`), so the
# app container must NOT also migrate -- two migration paths racing the same
# advisory lock is exactly the failure mode #1069 describes. Legacy ECS has no
# such Job, so its task definition sets RUN_MIGRATIONS_ON_BOOT=true to keep the
# entrypoint as its only migration path. `db:update` == `prisma migrate deploy`;
# under `set -e` a failed migration here aborts start (fail closed).
if [ "$RUN_MIGRATIONS_ON_BOOT" = "true" ]; then
    # schema.prisma now declares `directUrl = env("DIRECT_DATABASE_URL")`, so
    # `prisma migrate deploy` hard-requires DIRECT_DATABASE_URL and aborts with a
    # bare P1012 if it is missing. Fail with a legible message instead, so an
    # operator who enabled migrations but forgot the second var (e.g. a legacy ECS
    # task definition) sees the cause rather than a schema-validation stack trace.
    if [ -z "$DIRECT_DATABASE_URL" ]; then
        echo 'ERROR: RUN_MIGRATIONS_ON_BOOT=true but DIRECT_DATABASE_URL is unset.' >&2
        echo '       prisma migrate deploy needs the direct (non-pooler) URL; set' >&2
        echo '       DIRECT_DATABASE_URL (== DATABASE_URL when there is no pooler).' >&2
        exit 1
    fi
    echo 'Applying prisma migrations (RUN_MIGRATIONS_ON_BOOT=true)...'
    pnpm db:update
else
    echo 'Skipping prisma migrations (RUN_MIGRATIONS_ON_BOOT not "true").'
fi

# NOTE: `prisma generate` is intentionally NOT run here. The Prisma client is
# generated at image-build time by prisma's postinstall during `pnpm install`
# in the Dockerfile, so regenerating on every boot is redundant (#1069).

if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting prod server'
    pnpm start
else
    echo 'Starting dev server with debugger'
    echo 'Starting db browser on http://localhost:5555'
    pnpm debug
fi
