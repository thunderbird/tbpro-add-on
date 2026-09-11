#!/usr/bin/env bash
# Tests for scripts/dev-send.sh. Run it directly:
#   ./scripts/test-dev-send.sh
#
# Everything runs against a throwaway fixture tree with a stub `docker` and a
# stub build.sh on PATH, so no container is started and the real repo is not
# touched. Worth having because dev:send and dev:detach are the entry point for
# local development and for both local test lanes, and their failure mode is a
# stack that never came up rather than an obvious error. The second-run case is a
# regression test: an early draft ended a branch with `[ ... ] || return`, which
# returns the failing test's status, and `set -e` turned a normal re-run into
# exit 1.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

# A fixture tree: the script under test, three .env.sample files, a stub build.sh
# (the real one rsyncs a backend that is not here) and a stub docker.
new_fixture() {
  local root
  root="$(mktemp -d)"
  mkdir -p "$root/scripts" "$root/bin" "$root/packages/send/backend/scripts" \
    "$root/packages/send/frontend" "$root/packages/send/e2e"
  cp "$REPO_ROOT/scripts/dev-send.sh" "$root/scripts/"
  printf 'BASE_URL=https://localhost:8088\nS3_BUCKET_NAME=send-local\n' \
    > "$root/packages/send/backend/.env.sample"
  printf 'VITE_SEND_SERVER_URL=https://localhost:8088\n' \
    > "$root/packages/send/frontend/.env.sample"
  printf 'TB_SEND_BASE_URL=http://localhost:5173/\n' > "$root/packages/send/e2e/.env.sample"
  printf '#!/bin/sh\necho "[stub build.sh]"\n' > "$root/packages/send/backend/scripts/build.sh"
  # The docker stub logs every invocation so tests can assert on calls whose
  # output the script discards (`rm ... >/dev/null`). Its `compose ps -a`
  # reply is configurable: a test writes the state line to minio-init-state,
  # standing in for whatever the real minio-init container reported.
  cat > "$root/bin/docker" <<'EOF'
#!/bin/sh
root="$(cd "$(dirname "$0")/.." && pwd)"
echo "docker $*" >> "$root/docker.log"
case "$*" in
  "compose ps -a"*minio-init*)
    [ ! -f "$root/minio-init-state" ] || cat "$root/minio-init-state"
    ;;
  *) echo "[stub docker $*]" ;;
esac
EOF
  chmod +x "$root/packages/send/backend/scripts/build.sh" "$root/bin/docker"
  echo "$root"
}

# Runs dev-send.sh in a fixture, detached so it does not tail logs.
run_dev_send() {
  local root="$1"
  shift
  (cd "$root" && PATH="$root/bin:$PATH" ./scripts/dev-send.sh --detach "$@" 2>&1)
}

pass() { echo "  ok   $1"; }
fail() {
  echo "  FAIL $1" >&2
  [ -z "${2:-}" ] || echo "       $2" >&2
  FAILED=$((FAILED + 1))
}

check_exit() { # name expected actual
  [ "$2" = "$3" ] && pass "$1" || fail "$1" "expected exit $2, got $3"
}

check_contains() { # name haystack needle
  case "$2" in
    *"$3"*) pass "$1" ;;
    *) fail "$1" "expected to find: $3" ;;
  esac
}

check_lacks() { # name haystack needle
  case "$2" in
    *"$3"*) fail "$1" "expected NOT to find: $3" ;;
    *) pass "$1" ;;
  esac
}

echo "fresh checkout"
FIX="$(new_fixture)"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits 0" 0 "$RC"
check_contains "creates the backend .env compose reads" "$OUT" "created packages/send/backend/.env"
check_contains "creates the frontend .env" "$OUT" "created packages/send/frontend/.env"
check_contains "creates the e2e .env" "$OUT" "created packages/send/e2e/.env"
check_contains "generates the backend build context" "$OUT" "[stub build.sh]"
check_contains "starts the stack" "$OUT" "[stub docker compose up -d --build]"
for pkg in backend frontend e2e; do
  if diff -q "$FIX/packages/send/$pkg/.env.sample" "$FIX/packages/send/$pkg/.env" >/dev/null; then
    pass "$pkg .env matches its sample"
  else
    fail "$pkg .env matches its sample"
  fi
done

echo "second run, .env files present (regression: used to exit 1)"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits 0" 0 "$RC"
check_lacks "creates nothing" "$OUT" "created "
check_contains "still refreshes the build context" "$OUT" "[stub build.sh]"
check_contains "still starts the stack" "$OUT" "[stub docker compose up -d --build]"

echo "an .env a contributor has edited"
printf 'BASE_URL=https://localhost:8088\nS3_BUCKET_NAME=my-own-bucket\n' \
  > "$FIX/packages/send/backend/.env"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits 0" 0 "$RC"
check_contains "is left alone" "$(cat "$FIX/packages/send/backend/.env")" "my-own-bucket"
rm -rf "$FIX"

echo "a missing sample fails before the stack starts"
FIX="$(new_fixture)"
rm "$FIX/packages/send/frontend/.env.sample"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits nonzero" 1 "$RC"
check_lacks "does not start the stack" "$OUT" "[stub docker"
if [ -f "$FIX/packages/send/frontend/.env" ] || [ -f "$FIX/packages/send/frontend/.env.tmp" ]; then
  fail "leaves no partial .env behind"
else
  pass "leaves no partial .env behind"
fi
rm -rf "$FIX"

echo "a cleanly exited minio-init is pruned"
FIX="$(new_fixture)"
printf 'exited 0\n' > "$FIX/minio-init-state"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits 0" 0 "$RC"
check_contains "removes the one-shot container" "$(cat "$FIX/docker.log")" \
  "docker compose rm --force minio-init"
rm -rf "$FIX"

echo "a failed minio-init is left behind for debugging"
FIX="$(new_fixture)"
printf 'exited 1\n' > "$FIX/minio-init-state"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits 0" 0 "$RC"
check_lacks "does not remove the container" "$(cat "$FIX/docker.log")" \
  "rm --force minio-init"
rm -rf "$FIX"

echo "no minio-init state reported (stub default) prunes nothing"
FIX="$(new_fixture)"
OUT="$(run_dev_send "$FIX")"; RC=$?
check_exit "exits 0" 0 "$RC"
check_lacks "does not remove the container" "$(cat "$FIX/docker.log")" \
  "rm --force minio-init"
rm -rf "$FIX"

echo "argument handling"
FIX="$(new_fixture)"
OUT="$(cd "$FIX" && PATH="$FIX/bin:$PATH" ./scripts/dev-send.sh --detach junk 2>&1)"; RC=$?
check_exit "extra arguments exit 2" 2 "$RC"
OUT="$(cd "$FIX" && PATH="$FIX/bin:$PATH" ./scripts/dev-send.sh -d 2>&1)"; RC=$?
check_exit "an unknown flag exits 2" 2 "$RC"
check_contains "prints usage" "$OUT" "usage:"
OUT="$(cd "$FIX" && PATH="$FIX/bin:$PATH" ./scripts/dev-send.sh --detach 2>&1)"; RC=$?
check_exit "--detach alone is accepted" 0 "$RC"
check_lacks "detached, so it does not tail logs" "$OUT" "logs -f"
rm -rf "$FIX"

echo
if [ "$FAILED" -eq 0 ]; then
  echo "dev-send: all checks passed"
else
  echo "dev-send: $FAILED check(s) failed" >&2
  exit 1
fi
