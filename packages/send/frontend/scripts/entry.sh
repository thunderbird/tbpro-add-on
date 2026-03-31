#!/bin/sh
echo 'installing frontend deps 🤖'
pnpm install --dir /app --no-frozen-lockfile

echo 'Starting dev server 🦄'
pnpm run dev
