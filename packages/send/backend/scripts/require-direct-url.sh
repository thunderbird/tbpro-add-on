#!/bin/sh
# Preflight for `prisma migrate deploy` (pnpm db:update).
#
# schema.prisma declares `directUrl = env("DIRECT_DATABASE_URL")`, so every
# schema command hard-requires that variable and otherwise aborts with a bare
# `P1012 Environment variable not found`. This turns that into a legible error.
#
# It lives in a script rather than inline in scripts/entry.sh because the
# entrypoint is NOT the only migration path: on EKS migrations run as an
# ArgoCD Sync-phase Job (send-deploy bases/send/migrate-job.yaml) whose
# `command` overrides the image entrypoint and calls `pnpm db:update` directly.
# Hanging the check off db:update covers both callers.
set -e

# Prisma reads .env itself, so a DSN that is only in .env (compose local dev,
# where DATABASE_URL/DIRECT_DATABASE_URL arrive via the bind-mounted /app/.env
# rather than the process environment) is a perfectly working setup. Accept it.
if [ -z "$DIRECT_DATABASE_URL" ] &&
    ! grep -Eq '^[[:space:]]*DIRECT_DATABASE_URL=[^[:space:]]' .env 2>/dev/null; then
    echo 'ERROR: prisma migrate needs DIRECT_DATABASE_URL, which is unset.' >&2
    echo '       Set it in the environment (ECS task definition / K8s Secret) or' >&2
    echo '       in .env. It is the DIRECT, non-pooler DSN; where there is no' >&2
    echo '       connection pooler it equals DATABASE_URL. See prisma/schema.prisma.' >&2
    exit 1
fi

# Presence is not enough: copying a Neon `-pooler` DSN in here satisfies the
# check above while leaving migrate's session-scoped advisory lock as unreliable
# as it was before directUrl existed (tbpro-add-on#1069). Warn, do not fail --
# self-hosted PgBouncer hostnames do not follow this naming.
case "$DIRECT_DATABASE_URL" in
*-pooler*)
    echo 'WARNING: DIRECT_DATABASE_URL points at a `-pooler` endpoint. Use the' >&2
    echo '         direct endpoint, or the migration advisory lock is unreliable.' >&2
    ;;
esac
