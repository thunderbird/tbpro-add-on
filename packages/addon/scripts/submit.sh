cd ..

mkdir addon-source

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < addon/package.json | sed 's/\./-/g')

# Copy only necessary files
cp -r addon/src addon-source/src
cp -r addon/public addon-source/public
cp addon/package.json addon-source/package.json
cp addon/tsconfig.json addon-source/tsconfig.json
cp addon/.env addon-source/
cp addon/index.extension.html addon-source/index.extension.html
cp addon/index.html addon-source/index.html
cp addon/index.management.html addon-source/index.management.html
cp addon/vite.config.extension.js addon-source/vite.config.extension.js
cp addon/vite.config.js addon-source/vite.config.js
cp addon/vite.config.management.js addon-source/vite.config.management.js
cp addon/tailwind.config.js addon-source/tailwind.config.js
cp addon/postcss.config.js addon-source/postcss.config.js
cp addon/pnpm-lock.yaml addon-source/pnpm-lock.yaml
cp addon/favicon.ico addon-source/favicon.ico
cp addon/README.md addon-source/README.md
mkdir addon-source/scripts
cp addon/scripts/build.sh addon-source/scripts/build.sh

# Create zip for submission
if [ "$IS_CI_AUTOMATION" != "yes" ]; then
    # Is *not* CI automation; is probably local dev
    zip -r addon-source-${VERSION}.zip addon-source
    rm -rf addon-source
    echo "Finished creating addon-source-${VERSION}.zip!"
else
    # *IS* CI automation
    zip -r addon-source.zip addon-source
    echo "Finished creating addon-source.zip!"
fi
