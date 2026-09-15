#!/bin/sh
### Usage: scripts/build.sh [web|all]
###
###   all (default) -- the web bundle AND the legacy standalone add-on
###                    (send-suite-*.xpi), for local extension work.
###   web           -- the web bundle only.
###
### CI (.github/workflows/merge.yml) passes `web`: the shipping add-on is the
### system add-on built from packages/addon, so a merge build has no use for the
### standalone XPI and must not publish one (issue #1238). The container image
### build (deploy.dockerfile) skips this script entirely and invokes vite directly.
TARGET="${1:-all}"
if [ "$TARGET" != web ] && [ "$TARGET" != all ]; then
    echo "ERROR: unknown build target '$TARGET' (expected 'web' or 'all')" >&2
    exit 1
fi

# Check if environment NODE_ENV has been set to production
if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting production build 🐧'
    # Pre-build makes sure the ID and name are set on the xpi for prod/stage
    ### Runs for the `web` target too, even though only the XPI cares about the
    ### id: vite's publicDir copies public/manifest.json into dist-web as well,
    ### so skipping it here would change the deployed bundle's contents.
    bun run scripts/set-id.ts
else
    echo 'Starting development build 🐣'
fi

### Declare the environment the bundle is being built FOR. Shared with the
### add-on build -- see the rationale in derive-app-env.sh. On the
### EKS/container path the pod states the environment (APP_ENV -> /config.js)
### and nothing here applies.
. "$(dirname "$0")/derive-app-env.sh"

# Copy css to backend
cp src/apps/send/style.css ../backend/public/style.css
sed -i.bak '1s/^/\/* WARNING THIS IS A SELF GENERATED FILE. ALL CHANGES WILL BE OVERWRITTEN ON BUILD. IF YOU WANT TO MODIFY THE ORIGINAL FILE, PLEASE MODIFY frontend\/public\/style.css *\/\n/' ../backend/public/style.css && rm ../backend/public/style.css.bak
# Copy public folder to backend
cp -R public/icons ../backend/public

echo "================================================================"
echo "=============== web app ================================"
echo 'Building web app 🏭'
rm -rf dist-web
### Checked explicitly: this script does not run under `set -e` (see the note in
### derive-app-env.sh), and the `web` target exits right below, so an unchecked
### failure here would exit 0 and let CI deploy a stale or half-written
### dist-web.
if ! vite build --config vite.config.js; then
    echo "ERROR: web app build failed" >&2
    exit 1
fi
echo 'Web app build complete 🎉'

if [ "$TARGET" = "web" ]; then
    exit 0
fi

### Everything below builds the legacy standalone add-on. Nothing in CI or in
### the shipped product consumes it -- it is kept for loading an unsigned build
### straight from `dist` during local development. Gated rather than deleted
### because deleting it also orphans public/manifest.json, scripts/set-id.ts and
### the three extension vite configs, and set-id.ts rewrites a manifest that
### vite's publicDir copies into dist-web -- i.e. removing it would change the
### deployed web bundle, which is out of scope for issue #1238.

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < package.json | sed 's/\./-/g')

# Remove old builds
rm -rf dist
rm -rf send-suite

mkdir -p dist/assets

### this should get copied automatically when compiling a page
cp -R public/* dist/
### config.js is the WEB APP's runtime-config hook, rewritten per-environment by
### the nginx entrypoint. No extension entry point loads it (only index.html
### carries the script tag), so shipping it inside the signed XPI would put a
### file whose sole purpose is server-side rewriting in front of Thunderbird's
### static packaged-script review for no benefit. The web app gets its own copy
### from vite's publicDir into dist-web, which this does not touch.
rm -f dist/config.js
# Generate headers json
echo 'Generating security headers 🔒'
bun run scripts/headers.ts
echo 'Headers generation complete 🎉'

echo "================================================================"
echo "=============== background.js =================================="
### Build `background.js` as a library
vite build --config vite.config.background.js
cp -R dist/background/* dist/
# cp -R dist/background/*.map dist/
# rm -rf dist/background


echo "================================================================"
echo "=============== extension UI ==================================="
### Extension UI
vite build --config vite.config.extension.js
cp -R dist/extension/assets/* dist/assets/
cp -R dist/extension/*.* dist/
rm -rf dist/extension

echo "================================================================"
echo "=============== management page================================="
### Management page, commenting out for now
vite build --config vite.config.management.js
cp -R dist/pages/assets/* dist/assets/
cp -R dist/pages/*.* dist/
rm -rf dist/pages

cd dist

# Create xpi with version number
zip -r -FS ../../send-suite-${VERSION}.xpi *

echo 'Add-on build complete 🎉'

