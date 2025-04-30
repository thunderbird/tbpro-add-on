cd ..

mkdir frontend-source

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < frontend/package.json | sed 's/\./-/g')

# Copy only necessary files
cp -r frontend/src frontend-source/src
cp -r frontend/public frontend-source/public
cp frontend/package.json frontend-source/package.json
cp frontend/tsconfig.json frontend-source/tsconfig.json
cp frontend/.env frontend-source/
cp frontend/index.extension.html frontend-source/index.extension.html
cp frontend/index.html frontend-source/index.html
cp frontend/index.management.html frontend-source/index.management.html
cp frontend/vite.config.extension.js frontend-source/vite.config.extension.js
cp frontend/vite.config.js frontend-source/vite.config.js
cp frontend/vite.config.management.js frontend-source/vite.config.management.js
cp frontend/tailwind.config.js frontend-source/tailwind.config.js
cp frontend/postcss.config.js frontend-source/postcss.config.js
cp frontend/pnpm-lock.yaml frontend-source/pnpm-lock.yaml
cp frontend/favicon.ico frontend-source/favicon.ico
cp frontend/README.md frontend-source/README.md
mkdir frontend-source/scripts
cp frontend/scripts/build.sh frontend-source/scripts/build.sh

# Create zip for submission
if [ "$IS_CI_AUTOMATION" != "yes" ]; then
    # Is *not* CI automation; is probably local dev
    zip -r frontend-source-${VERSION}.zip frontend-source
    rm -rf frontend-source
    echo "Finished creating frontend-source-${VERSION}.zip!"
else
    # *IS* CI automation
    zip -r frontend-source.zip frontend-source
    echo "Finished creating frontend-source.zip!"
fi
