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

# Copy the root workspace lockfile (available for reference but not used in Docker
# install, since the container workspace layout differs from the monorepo root).
cp "$REPO_ROOT/pnpm-lock.yaml" "$CONTEXT_DIR/pnpm-lock.yaml"

# Exclude pre-installed node_modules; Docker re-installs for the target platform
printf 'node_modules/\n' > "$CONTEXT_DIR/.dockerignore"

echo "Build context ready at $CONTEXT_DIR"