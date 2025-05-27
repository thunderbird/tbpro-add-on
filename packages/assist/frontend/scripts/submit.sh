cd ..

mkdir frontend-source

# Copy only necessary files
cp -r frontend/src frontend-source/src
cp -r frontend/public frontend-source/public
cp frontend/package.json frontend-source/package.json
cp frontend/tsconfig.json frontend-source/tsconfig.json
cp frontend/tsconfig.node.json frontend-source/tsconfig.node.json
cp frontend/tsconfig.app.json frontend-source/tsconfig.app.json
cp frontend/tsconfig.vitest.json frontend-source/tsconfig.vitest.json
#cp frontend/.env.production frontend-source/.env.production
cp frontend/index.html frontend-source/index.html
cp frontend/vite.config.background.js frontend-source/vite.config.background.js
cp frontend/vite.config.js frontend-source/vite.config.js
cp frontend/vitest.config.ts frontend-source/vitest.config.ts
cp frontend/pnpm-lock.yaml frontend-source/pnpm-lock.yaml
cp frontend/README.md frontend-source/README.md
mkdir frontend-source/scripts
cp frontend/scripts/update-manifest.sh frontend-source/scripts/update-manifest.sh
cp frontend/scripts/build.sh frontend-source/scripts/build.sh

# Create zip for submission
zip -r frontend-source.zip frontend-source
# Remove the directory
rm -rf frontend-source

#mv frontend/send-suite-alpha.xpi  send-suite-alpha.xpi

echo "Finished creating frontend-source.zip!"
