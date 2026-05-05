#!/usr/bin/env node
// Bumps the patch version of all packages and manifests (excluding assist).
'use strict';

const fs = require('fs');

const files = [
    'packages/addon/package.json',
    'packages/addon/public/manifest.json',
    'packages/send/package.json',
    'packages/send/frontend/package.json',
    'packages/send/frontend/public/manifest.json',
    'packages/send/backend/package.json',
];

files.forEach((f) => {
    const raw = fs.readFileSync(f, 'utf8');
    const pkg = JSON.parse(raw);
    const parts = pkg.version.split('.');
    parts[2] = String(Number(parts[2]) + 1);
    pkg.version = parts.join('.');
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Bumped ${f} → ${pkg.version}`);
});
