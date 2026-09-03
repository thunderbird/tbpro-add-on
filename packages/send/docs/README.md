# Thunderbird Send Suite

Two applications that extend the functionality of Thunderbird:

- Send extension: email attachments using the CloudFile API
- Send web: file storage and sharing

Both are end-to-end encrypted.

> The quick start below is a summary. The maintained setup instructions live in the
> [repo README](../../../README.md) and the [Send README](../README.md); the rest of this folder is
> design documentation.

## Tooling

- Node.js 22.x (`engines` requires `>=22.11.0`)
- `pnpm` (v10.6.4 or later) — this is a pnpm workspace, so `npm` and `yarn` will not resolve it
- `bun` — a few package scripts run through it
- `docker` with the `compose` plugin (v2.24.4 or later)

## Quick start

### Install dependencies and create the `.env` files

From the repo root:

```sh
pnpm install --filter @thunderbird/tbpro-add-on && lerna run bootstrap
pnpm --filter send-suite run setup
```

### Start the whole stack

One `compose.yml`, at the repo root, runs the database, the object store, the backend, the TLS
reverse proxy and the frontend together:

```sh
pnpm run dev:send
```

### Let your browser use the self-signed TLS certificate

- visit `https://localhost:8088` in your browser
- allow your browser to go to the page, despite the certificate being self-signed
- you should see a page with the word "echo"

### Open the Send UI in the browser

Visit `http://localhost:5173/`

### Create your user and encryption keys

- Click `Or register` on the login screen
- Enter an email address and a password
- Click `Download and Continue` to create your recovery key

Your keys are generated in the browser. The recovery key you download is the only way to restore
them on another device — it is never stored on the server.

### Use the app!

You can now:

- create folders
- upload files
- share folders with other users
- generate share links to send to other users or anonymous users
