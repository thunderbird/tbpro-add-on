#!/usr/bin/env bash
#
# Sync a built (system-id) dist/ into a local comm-central checkout's vendored
# built-in add-on directory, so the add-on can be tested as the real built-in /
# system add-on (loaded under resource://builtin-addons/thundermail/, enabled by
# default, no install flow).
#
# The add-on is vendored in comm-central at
#   comm/mail/extensions/builtin-addons/thundermail/extension/
# and packaged into messenger.jar via that dir's jar.mn. This script refreshes
# that copy from this repo's dist/, then you rebuild + run from the comm tree:
#
#   export TB_COMM_SRC=/path/to/your/tb-build/source
#   pnpm --filter addon sync:builtin            # build (system id) + sync
#   cd "$TB_COMM_SRC" && ./mach build faster    # repackage messenger.jar
#   ./mach run --temp-profile                   # fresh profile avoids stale builtin cache
#
# Run `pnpm --filter addon dev:builtin` to auto-sync on every source change.
#
# Requires TB_COMM_SRC to point at the comm-central source root (the dir that
# contains the `comm/` subdir). No default — there can be several build trees.

set -euo pipefail

if [ -z "${TB_COMM_SRC:-}" ]; then
  echo "ERROR: TB_COMM_SRC is not set." >&2
  echo "  Set it to your comm-central source root, e.g.:" >&2
  echo "  export TB_COMM_SRC=/Users/you/WebApps/tb-build/source" >&2
  exit 1
fi

DEST="$TB_COMM_SRC/comm/mail/extensions/builtin-addons/thundermail/extension"

if [ ! -d "$DEST" ]; then
  echo "ERROR: vendored add-on dir not found:" >&2
  echo "  $DEST" >&2
  echo "  Check TB_COMM_SRC ('$TB_COMM_SRC') points at the comm-central source root" >&2
  echo "  and that the thundermail built-in add-on is present in that tree." >&2
  exit 1
fi

# scripts/ lives in packages/addon, so dist/ is one level up from here.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$SCRIPT_DIR/../dist"

if [ ! -f "$DIST/manifest.json" ]; then
  echo "ERROR: $DIST/manifest.json not found — run the build first (pnpm build:dev:system)." >&2
  exit 1
fi

# Guard: the synced build must carry the system add-on id, otherwise the
# built-in would run under the wrong identity and the id-keyed guards wouldn't
# be exercised. sync:builtin runs build:dev:system, which sets this.
if ! grep -q "tbpro-system-add-on@thunderbird.net" "$DIST/manifest.json"; then
  echo "ERROR: $DIST/manifest.json does not contain the system add-on id." >&2
  echo "  Build with the system variant: pnpm build:dev:system" >&2
  exit 1
fi

echo "Syncing $DIST/ -> $DEST/"
# --delete so files removed from the build don't linger in the vendored copy.
rsync -a --delete "$DIST/" "$DEST/"

echo "Synced. Now: cd \"\$TB_COMM_SRC\" && ./mach build faster && ./mach run --temp-profile"
