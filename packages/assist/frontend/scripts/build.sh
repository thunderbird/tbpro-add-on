#!/usr/bin/env bash

cd "$(dirname "$0")/.."

# Clean and set up
rm -rf dist/*
mkdir -p dist/assets

# Build the vue app
vite build --mode ${NODE_ENV:-development}

# The config for the vue app outputs to `dist/extension`.
# Copy files to correct location and clean up.
cp -R dist/extension/assets/* dist/assets/
cp -R dist/extension/*.* dist/
rm -rf dist/extension

# Build `background.js` as a library
vite build --mode ${NODE_ENV:-development} --config vite.config.background.js
cp -R dist/background/*.js dist/
cp -R dist/background/*.map dist/
cp -R dist/background/manifest.json dist/
rm -rf dist/background

# Build `options.js` as a library
vite build --mode ${NODE_ENV:-development} --config vite.config.options.js
cp -R dist/options/*.* dist/
rm -rf dist/options

# Build `message_content_script.js` as a library
vite build --mode ${NODE_ENV:-development} --config vite.config.content.js
cp -R dist/content/*.js dist/
cp -R dist/content/*.map dist/
rm -rf dist/content

echo "finished building"
