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
echo "=============== rewrite font urls =============================="
### The bundled CSS (from send-frontend's fonts.css) declares @font-face rules
### with absolute url(/fonts/...). When the add-on is loaded as a built-in
### add-on, an absolute /fonts/ url resolves against the resource:// protocol
### root (resource://builtin-addons/fonts/Inter/...) instead of the add-on's own
### directory, so the fonts 404 and Thunderbird's static browser_parsable_css.js
### check crashes (Bug 2036665). The CSS lives in dist/assets/ and the fonts in
### dist/fonts/, so rewrite the absolute url(/fonts/...) to a relative
### url(../fonts/...) that resolves inside the add-on's own directory.
###
### The url() value may be quoted or bare: production (minified) builds emit
### url(/fonts/...) while dev/unminified builds preserve the source quotes,
### url('/fonts/...'). Capture the optional quote ((["\x27]?), \x27 = ') and
### re-emit it so both forms are rewritten — a quote-blind regex silently
### leaves dev builds absolute and re-introduces the crash above.
find dist/assets -name '*.css' -exec perl -pi -e 's{url\((["\x27]?)/fonts/}{url($1../fonts/}g' {} +

### Fail the build if any absolute /fonts/ url() survived the rewrite, so a
### broken bundle can never silently ship and crash browser_parsable_css.js.
if grep -REq "url\((['\"]?)/fonts/" dist/assets/*.css; then
    echo "ERROR: absolute /fonts/ url() survived rewrite — would crash browser_parsable_css.js" >&2
    grep -REn "url\((['\"]?)/fonts/" dist/assets/*.css >&2
    exit 1
fi

echo "================================================================"
echo "=============== sanitize parsable css =========================="
### Thunderbird's static browser_parsable_css.js check (Bug 2036665) rejects a
### handful of declarations that autoprefixer / vendored libs leak into the
### bundled CSS:
###   * -moz-column-gap          -> not a real Gecko property (the standard
###                                 column-gap is emitted right alongside it)
###   * -webkit-text-size-adjust -> value rejected by Gecko's parser
###   * :global(...)             -> Vue scoped-CSS wrapper left unprocessed
### Drop the two dead vendor-prefixed declarations and unwrap :global(X) -> X so
### the packaged add-on passes the static check.
find dist/assets -name '*.css' -exec perl -pi -e \
  's/-moz-column-gap:[^;}]*;?//g; s/-webkit-text-size-adjust:[^;}]*;?//g; s/:global\(([^)]*)\)/$1/g;' {} +

echo "================================================================"
echo "=============== background.js =================================="
### Build `background.js` as a library
vite build --config vite.config.background.js
cp -R dist/background/* dist/
# cp -R dist/background/*.map dist/f
# cp -R dist/background/manifest.json dist/
rm -rf dist/background

rm -rf dist/pages

### When building the system/built-in add-on variant (ADDON_VARIANT=system),
### rewrite the built dist manifest's prod id to the system add-on id
### (tbpro-system-add-on@thunderbird.net) so the local build matches the id
### Thunderbird ships it under and exercises the id-keyed runtime guards
### (installGate.ts / selfUninstall.ts). Operates on the built copy only — the
### source public/manifest.json keeps the prod id. Reuses set-system-id.ts, the
### same script CI uses when repacking the system XPI.
if [ "$ADDON_VARIANT" = "system" ]; then
    echo "================================================================"
    echo "=============== system add-on id ==============================="
    ### --allow-stage: a dev build's dist manifest carries the STAGE id (set-id.ts
    ### only runs for prod), so accept STAGE too. CI's prod-XPI repack omits the
    ### flag and keeps its strict PROD-only guard.
    bun run scripts/set-system-id.ts dist/manifest.json --allow-stage
fi

cd dist
# Create xpi with version number
zip -r -FS ../tbpro-addon-${VERSION}.xpi *

echo 'Add-on build complete 🎉'
