#!/usr/bin/env bash
# Tests for packages/send/backend/scripts/standalone-lockfile.sh. Run it directly:
#   ./scripts/test-standalone-lockfile.sh
#
# Runs against throwaway copies, so the real lockfile is not touched. The Docker
# builds in CI are the end-to-end check (a bad rewrite fails the backend image's
# `pnpm install --frozen-lockfile`); this pins down the rewrite itself and the
# failure mode when the importer is missing.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/packages/send/backend/scripts/standalone-lockfile.sh"
FAILED=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "ok   - $name"
  else
    echo "FAIL - $name"
    FAILED=1
  fi
}

# --- Fixture: a small monorepo lockfile with three importers.
dir="$(mktemp -d)"
cat > "$dir/pnpm-lock.yaml" <<'EOF'
lockfileVersion: '9.0'

overrides:
  foo@<2: ^2.0.0

importers:

  .:
    devDependencies:
      lerna:
        specifier: 1.0.0
        version: 1.0.0

  packages/send/backend:
    dependencies:
      foo:
        specifier: ^2.0.0
        version: 2.0.0

  packages/send/frontend:
    dependencies:
      bar:
        specifier: 1.0.0
        version: 1.0.0

packages:

  foo@2.0.0:
    resolution: {integrity: sha512-x}
EOF
cat > "$dir/pnpm-workspace.yaml" <<'EOF'
packages:
  - packages/send
  - packages/send/backend

onlyBuiltDependencies:
  - prisma

overrides:
  foo@<2: ^2.0.0
EOF

(cd "$dir" && sh "$SCRIPT")
check "exits 0 on the fixture" [ $? -eq 0 ]
check "backend importer is renamed to ." grep -qx '  \.:' "$dir/pnpm-lock.yaml"
check "backend deps are kept" grep -qx '      foo:' "$dir/pnpm-lock.yaml"
check "other importers are dropped" \
  bash -c "! grep -qE '^  (packages/|lerna|bar)' '$dir/pnpm-lock.yaml' && ! grep -q 'lerna:' '$dir/pnpm-lock.yaml'"
check "overrides and packages are kept" \
  bash -c "grep -qx 'overrides:' '$dir/pnpm-lock.yaml' && grep -qx '  foo@2.0.0:' '$dir/pnpm-lock.yaml'"
check "workspace packages list is replaced with ." \
  bash -c "[ \"\$(sed -n '1,2p' '$dir/pnpm-workspace.yaml')\" = \"\$(printf 'packages:\n  - \".\"')\" ] && ! grep -q 'packages/send' '$dir/pnpm-workspace.yaml'"
check "other workspace settings are kept" \
  bash -c "grep -qx '  - prisma' '$dir/pnpm-workspace.yaml' && grep -qx '  foo@<2: ^2.0.0' '$dir/pnpm-workspace.yaml'"
rm -rf "$dir"

# --- Missing importer: fail loudly and leave the lockfile alone.
dir="$(mktemp -d)"
printf "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    {}\n" > "$dir/pnpm-lock.yaml"
printf 'packages:\n  - "."\n' > "$dir/pnpm-workspace.yaml"
cp "$dir/pnpm-lock.yaml" "$dir/before.yaml"
(cd "$dir" && sh "$SCRIPT" 2>/dev/null)
check "exits non-zero when the backend importer is missing" [ $? -ne 0 ]
check "leaves the lockfile untouched on failure" cmp -s "$dir/pnpm-lock.yaml" "$dir/before.yaml"
rm -rf "$dir"

# --- The real root lockfile still has exactly the importer the script expects.
dir="$(mktemp -d)"
cp "$REPO_ROOT/pnpm-lock.yaml" "$REPO_ROOT/pnpm-workspace.yaml" "$dir/"
(cd "$dir" && sh "$SCRIPT")
check "rewrites the real root lockfile" [ $? -eq 0 ]
check "real lockfile ends up with exactly one importer" \
  bash -c "[ \"\$(sed -n '/^importers:/,/^[^ i]/p' '$dir/pnpm-lock.yaml' | grep -c '^  [^ ]')\" = 1 ]"
rm -rf "$dir"

exit "$FAILED"
