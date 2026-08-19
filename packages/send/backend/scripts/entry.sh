#!/bin/sh

# Fail closed. This script previously had no `set -e`, so a failed
# `prisma migrate deploy` was silently swallowed and the server booted anyway
# against a possibly-unmigrated schema (tbpro-add-on#1069). With `set -e` any
# non-zero command aborts container start instead of falling through to a
# running server in a half-initialised state.
set -e

# CI-only: the e2e harness drives this image and needs workspace deps installed
# at boot. Normal images already have deps baked in by the Dockerfile.
# Non-fatal on purpose: `--frozen-lockfile` cannot succeed against the lockfile
# baked into this image (the Dockerfile installs with --no-lockfile for the
# reason described in scripts/build.sh), and under `set -e` a hard failure here
# would mean the container never starts.
if [ "$IS_CI_AUTOMATION" = "yes" ]; then
    echo 'CI automation: installing backend deps'
    pnpm install --frozen-lockfile ||
        echo 'WARNING: boot-time install failed; falling back to the deps baked into the image' >&2
else
    echo 'Not CI automation: using the deps baked into the image'
fi

if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting with NODE_ENV on production'
fi

# Migrations are OFF by default and opt-in via RUN_MIGRATIONS_ON_BOOT=true.
#
# WHY: on EKS, migrations run as a dedicated Kargo/ArgoCD Sync-phase Job at wave
# 0 (send-deploy: bases/send/migrate-job.yaml, command `pnpm db:update`), so the
# app container must NOT also migrate. Two concurrent `migrate deploy` runs
# serialise on pg_advisory_lock(72707369), and #1069 records that this session-
# scoped lock is unreliable through Neon's `-pooler` endpoint. Legacy ECS has no
# such Job, so its task definition opts in to keep the entrypoint as its
# migration path (packages/send/pulumi/config.{stage,prod}.yaml).
# `db:update` == preflight + `prisma migrate deploy`; under `set -e` a failed
# migration aborts start (fail closed) instead of being swallowed, which is the
# other half of #1069.
if [ "$RUN_MIGRATIONS_ON_BOOT" = "true" ]; then
    echo 'Applying prisma migrations (RUN_MIGRATIONS_ON_BOOT=true)...'
    pnpm db:update
else
    echo 'Skipping prisma migrations (RUN_MIGRATIONS_ON_BOOT not "true").'
fi

if [ "$NODE_ENV" = "production" ]; then
    # NOTE: `prisma generate` is intentionally NOT run in production. The Prisma
    # client is generated at image-build time by prisma's postinstall during
    # `pnpm install` in the Dockerfile, so regenerating on every boot is
    # redundant (#1069).
    #
    # exec, so node is PID 1 and receives SIGTERM directly. Shelling out through
    # `pnpm start` leaves /bin/sh as PID 1, which does not forward signals, so a
    # Kubernetes rollout would SIGKILL the server after the grace period instead
    # of letting it drain. Equivalent to package.json's `start`, minus pnpm.
    echo 'Starting prod server'
    exec node dist/index.js
else
    # Dev only: compose mounts a named volume over /app/node_modules, which
    # shadows the client generated at image build and is seeded once, so a
    # rebuild alone would leave a stale client after a schema edit.
    echo 'Generating prisma client...'
    pnpm db:generate
    echo 'Starting dev server with debugger'
    echo 'Starting db browser on http://localhost:5555'
    pnpm debug
fi
