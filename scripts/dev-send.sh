#!/usr/bin/env bash
# Bring up the local Send stack -- in one command, on a fresh checkout.
#
# `docker compose up` alone cannot do that. It hard-fails on a missing
# packages/send/backend/.env, which compose reads itself, and on a missing
# packages/send/backend/.docker-build, the backend image's build context. Both
# are generated and gitignored, so every clone and every new worktree starts
# without them, and the only place either step was written down was the error
# message you got for skipping it. This script does them first, then hands off to
# compose.
#
# Idempotent and non-destructive: an existing .env is left exactly as it is, and
# a second run has nothing to do.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FOLLOW_LOGS=true
case "${1:-}" in
  --detach) FOLLOW_LOGS=false ;;
  "") ;;
  *) echo "usage: $0 [--detach]" >&2; exit 2 ;;
esac
# Checked separately from the case above, which would otherwise accept -- and
# ignore -- `--detach junk`.
if [ "$#" -gt 1 ]; then
  echo "usage: $0 [--detach]" >&2
  exit 2
fi

# Create only what is missing. An .env that exists is a contributor's own
# configuration, and overwriting it to save them a copy is not a trade worth
# making; `pnpm --filter send-suite run setup` is still the way to reset them.
ensure_env() {
  # Separate statements: bash 3.2, which is what /bin/bash is on macOS, does not
  # see `dir` while evaluating a later assignment in the same `local`.
  local dir="$1"
  local dest="$dir/.env"
  if [ -f "$dest" ]; then
    return 0
  fi
  # Via a temp file, removed on failure: a half-written .env would look like a
  # configuration someone chose, and build.sh would rsync a leftover .tmp into
  # the backend build context.
  cp "$dir/.env.sample" "$dest.tmp" || {
    rm -f "$dest.tmp"
    exit 1
  }
  mv "$dest.tmp" "$dest"
  echo "  created $dest from .env.sample"
  return 0
}

echo "Env files:"
ensure_env packages/send/backend
ensure_env packages/send/frontend
ensure_env packages/send/e2e

# The backend image builds from a generated context rather than from the source
# tree (build.sh explains why). Regenerate it every run so the image cannot be
# built from stale source.
echo "Backend build context:"
sh packages/send/backend/scripts/build.sh

if [ "$FOLLOW_LOGS" = true ]; then
  docker compose up --build --force-recreate -d
  # exec, so Ctrl-C reaches the log tail rather than this shell.
  exec docker compose logs -f
else
  docker compose up -d --build
fi
