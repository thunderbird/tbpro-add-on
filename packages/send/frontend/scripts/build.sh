# Check if environment NODE_ENV has been set to production
if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting production build 🐧'
    # Pre-build makes sure the ID and name are set on the xpi for prod/stage
    bun run scripts/set-id.ts
else
    echo 'Starting development build 🐣'
fi

### Declare the environment the bundle is being built FOR. Shared with the
### add-on build -- see the rationale in derive-app-env.sh. On the
### EKS/container path the pod states the environment (APP_ENV -> /config.js)
### and nothing here applies.
. "$(dirname "$0")/derive-app-env.sh"

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < package.json | sed 's/\./-/g')

# Copy css to backend
cp src/apps/send/style.css ../backend/public/style.css
sed -i.bak '1s/^/\/* WARNING THIS IS A SELF GENERATED FILE. ALL CHANGES WILL BE OVERWRITTEN ON BUILD. IF YOU WANT TO MODIFY THE ORIGINAL FILE, PLEASE MODIFY frontend\/public\/style.css *\/\n/' ../backend/public/style.css && rm ../backend/public/style.css.bak
# Copy public folder to backend
cp -R public/icons ../backend/public

# Remove old builds
rm -rf dist && rm -rf dist-web
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

echo "================================================================"
echo "=============== web app================================="
echo 'Building web app 🏭'
vite build --config vite.config.js
echo 'Web app build complete 🎉'

cd dist

# Create xpi with version number
zip -r -FS ../../send-suite-${VERSION}.xpi *

echo 'Add-on build complete 🎉'

