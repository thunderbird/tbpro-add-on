#!/bin/sh
# Warn the user this will overwrite their .env files
# If they press y or Y, continue
echo "This script will overwrite your .env files. Continue? [y/N]"
read -r response
case "$response" in
    [yY]) ;;
    *)
        echo "Exiting..."
        exit 1
        ;;
esac

echo "Copying .env files for addon package..."
cp .env.sample .env
