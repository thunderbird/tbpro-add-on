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

echo "Copying .env files..."

# Copy env files
cd frontend
cp .env.sample .env
cd ../backend
cp .env.sample .env
cd ..
# Copy e2e env file
cd e2e
cp .env.sample .env


