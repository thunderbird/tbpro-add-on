# Check if environment NODE_ENV has been set to production
if [ "$NODE_ENV" = "production" ]; then
    echo 'Starting production build 🐧'
else
    echo 'Starting development build 🐣'
fi

# Pre-build makes sure the ID and name are set on the xpi for prod/stage
# bun run scripts/set-id.ts

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < package.json | sed 's/\./-/g')

# Copy css to backend
# cp src/apps/send/style.css ../send/backend/public/style.css
# sed -i.bak '1s/^/\/* WARNING THIS IS A SELF GENERATED FILE. ALL CHANGES WILL BE OVERWRITTEN ON BUILD. IF YOU WANT TO MODIFY THE ORIGINAL FILE, PLEASE MODIFY frontend\/public\/style.css *\/\n/' ../send/backend/public/style.css && rm ../send/backend/public/style.css.bak
# Copy public folder to backend
# cp -R public/icons ../send/backend/public

# Remove old builds
rm -rf dist && rm -rf dist-web
rm -rf send-suite

mkdir -p dist/assets

### this should get copied automatically when compiling a page
cp -R public/* dist/

### Extension UI
# vite build --config vite.config.extension.js
# cp -R dist/extension/assets/* dist/assets/
# cp -R dist/extension/*.* dist/
# rm -rf dist/extension

### Management page, commenting out for now
vite build --config vite.config.management.js
cp -R dist/pages/assets/* dist/assets/
cp -R dist/pages/*.* dist/

# build the background script
vite build --config vite.config.background.js
cp -R dist/background/*.js dist/
cp -R dist/background/*.js.map dist/
# cp -R dist/background/*.map dist/f
# cp -R dist/background/manifest.json dist/
rm -rf dist/background

rm -rf dist/pages

cd dist

# Create xpi with version number
zip -r -FS ../tbpro-addon-${VERSION}.xpi *

echo 'Add-on build complete 🎉'
