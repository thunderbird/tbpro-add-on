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

echo "================================================================"
echo "=============== extension UI ==================================="
### Extension UI
vite build --config vite.config.extension.js
cp -R dist/extension/assets/* dist/assets/
cp -R dist/extension/*.* dist/
rm -rf dist/extension
echo "================================================================"


### Management page, commenting out for now
vite build --config vite.config.management.js
cp -R dist/pages/assets/* dist/assets/
cp -R dist/pages/*.* dist/


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
zip -r -FS ./tbpro-addon-${VERSION}.xpi *

echo 'Add-on build complete 🎉'
