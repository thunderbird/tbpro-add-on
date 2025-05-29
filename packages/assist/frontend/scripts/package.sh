#!/usr/bin/env bash

cd "$(dirname "$0")/.."

# Get version from package.json and replace dots with hyphens
VERSION=$(jq -r .version < package.json | sed 's/\./-/g')

# Build the xpi
cd dist

# Create xpi with version number
zip -r -FS ../../assist-alpha-${VERSION}.xpi *
