# Send Frontend

The Thunderbird Send web client: a Vue 3 + Vite app, built with `<script setup>` SFCs. It is also
the source the Thunderbird extension is built from.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur). The old "TypeScript Vue Plugin (Volar)" is no longer needed — it was folded into that extension.

## Before you run the app

This package needs a `.env` file, and it is gitignored, so a fresh checkout has none. Nothing
errors without it — the unit tests pass, and so does `vite build` — but every `VITE_*` value comes
out empty, so the app has no backend to talk to.

```sh
cp .env.sample .env
```

(`pnpm --filter send-suite run setup`, from the repo root, does this for the frontend, backend and
e2e packages at once.)

Note that `public/config.js` — which the deployed app uses to configure itself at runtime — is
read _before_ the `VITE_*` values baked in from `.env`. The committed copy is intentionally empty
so local development falls through to `.env`; if you put values in it, they win. See
`src/config.ts`.

## Building the application

Run `pnpm i && pnpm build`

This generates the extension file at `packages/send`, named after the version in this package's
`package.json` with the dots replaced by hyphens — at 8.0.6, `send-suite-8-0-6.xpi`. Additionally, it will generate a `dist` folder with the extension files, a `dist-web` folder with the web files.

## Previewing a production build (web)

Prerequisite: If you have different values you want to use for a production build, it would be a good time to set them on your `frontend/.env`. If you're running a backend locally, that should be running.

To build the frontend run from the root `lerna run build --scope=send-frontend`
This will produce the static assets for deployment. It will generate the following directories:

Web app: `frontend/dist-web`

TB extension: `frontend/dist`

To test the web client locally, you can run
`cd frontend`
and `pnpm preview`

This will create a server on `http://localhost:4173/`, you can test your app there.

You might be wondering why not just run the dev environment. Here is a useful [answer that might help](https://stackoverflow.com/questions/71703933/what-is-the-difference-between-vite-and-vite-preview)
