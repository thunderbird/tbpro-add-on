#!/bin/sh
# Warn the user this will overwrite their .env files
# If they press Y continue
echo "This script will overwrite your .env files. Press Y then Enter to continue."
read -r response
if [ "$response" != "Y" ]; then
    echo "Exiting..."
    exit 1
fi

echo "Copying .env files for addon package..."
cp .env.sample .env
