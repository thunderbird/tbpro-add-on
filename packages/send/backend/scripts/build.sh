#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTEXT_DIR="$SCRIPT_DIR/../.docker-build"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "Preparing Docker build context..."
rm -rf "$CONTEXT_DIR"

# Copy backend source files, excluding build artifacts and node_modules.
# rsync preserves the original package.json (pnpm deploy mutates it with virtual
# store key versions that cannot be re-resolved in a standalone container).
rsync -a \
  --exclude='.docker-build' \
  --exclude='node_modules' \
  --exclude='.pnpm-store' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='src/test/routes' \
  "$SCRIPT_DIR/../" \
  "$CONTEXT_DIR/"

# Copy the root workspace lockfile and workspace config. The Dockerfile rewrites
# them into a single-project workspace (scripts/standalone-lockfile.sh) and
# installs with --frozen-lockfile, so the image gets exactly the locked versions.
cp "$REPO_ROOT/pnpm-lock.yaml" "$CONTEXT_DIR/pnpm-lock.yaml"
cp "$REPO_ROOT/pnpm-workspace.yaml" "$CONTEXT_DIR/pnpm-workspace.yaml"

# Exclude pre-installed node_modules; Docker re-installs for the target platform
printf 'node_modules/\n' > "$CONTEXT_DIR/.dockerignore"

echo "Build context ready at $CONTEXT_DIR"