# Check if environment NODE_ENV has been set to production
if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting production build 🐧'
    # Pre-build makes sure the ID and name are set on the xpi for prod/stage
    bun run scripts/set-id.ts
else
    echo 'Starting development build 🐣'
fi

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < package.json | sed 's/\./-/g')

# Remove old builds
rm -rf dist

mkdir -p dist/assets

### this should get copied automatically when compiling a page
cp -R public/* dist/

### Bundle the webfonts referenced by the extension/management CSS.
### The send-frontend styles declare @font-face rules pointing at
### url(/fonts/Inter/...) and url(/fonts/Metropolis/...). Those font files live
### in the send-frontend package, not in this add-on's public/ dir, so without
### them the packaged add-on ships CSS that references resources missing from
### the bundle. Thunderbird's static browser_parsable_css.js check then resolves
### every url() and crashes on the first missing font
### (resource://builtin-addons/.../fonts/Inter/Inter-Regular.woff2). See Bug
### 2036665. subset-fonts.mjs writes a Latin-subset, woff2-only copy to
### dist/fonts so the absolute /fonts/ urls resolve from the add-on root while
### keeping the bundle small.
echo "================================================================"
echo "=============== webfonts ======================================="
node scripts/subset-fonts.mjs

echo "================================================================"
echo "=============== extension UI ==================================="
### Extension UI
vite build --config vite.config.extension.js
cp -R dist/extension/assets/* dist/assets/
cp -R dist/extension/*.* dist/
if [ -d dist/extension/chunks ]; then
    mkdir -p dist/chunks
    cp -R dist/extension/chunks/* dist/chunks/
fi
rm -rf dist/extension

echo "================================================================"
echo "=============== management page================================="
### Management page, commenting out for now
vite build --config vite.config.management.js
cp -R dist/pages/assets/* dist/assets/
cp -R dist/pages/*.* dist/
if [ -d dist/pages/chunks ]; then
    mkdir -p dist/chunks
    cp -R dist/pages/chunks/* dist/chunks/
fi


echo "================================================================"
echo "=============== background.js =================================="
### Build `background.js` as a library
vite build --config vite.config.background.js
cp -R dist/background/* dist/
# cp -R dist/background/*.map dist/f
# cp -R dist/background/manifest.json dist/
rm -rf dist/background

rm -rf dist/pages

cd dist
# Create xpi with version number
zip -r -FS ../tbpro-addon-${VERSION}.xpi *

echo 'Add-on build complete 🎉'
