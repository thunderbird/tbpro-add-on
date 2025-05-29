#!/usr/bin/env bash

# Read the version from package.json
VERSION=$(jq -r '.version' package.json)

# Update the version in manifest.json
jq --arg version "$VERSION" '.version = $version' ./public/manifest.json > ./public/manifest.tmp.json && mv ./public/manifest.tmp.json ./public/manifest.json

echo "Updated manifest.json with version $VERSION"
