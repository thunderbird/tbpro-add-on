# Setup

Lockbox was the working name for what shipped as Thunderbird Send: a web application and Thunderbird extension built with Node.js and Vue.js.

It provides end-to-end encrypted cloud file management and sharing. Lockbox integrates with Thunderbird, letting the user manage and share files from the embedded Lockbox UI. In addition, the extension facilitates encrypted attachments via the CloudFile API.

> These are the original setup notes. The maintained setup instructions are in the
> [repo README](../../../README.md) and the [Send README](../README.md); what is still worth
> keeping here is the list of database commands at the bottom.

To develop locally, clone the repository and install the dependencies from the repo root.

```sh
git clone git@github.com:thunderbird/tbpro-add-on.git
cd tbpro-add-on
pnpm install
```

# Running the web application

The whole stack — database, object store, backend, TLS reverse proxy and frontend — runs from one `compose.yml` at the repo root, so there is no longer a separate terminal for the frontend.

```sh
pnpm run dev:send
```

## Backend

Runs on the following ports:

- 8088 (https, through the reverse proxy)
- 8080 (http, the backend container directly)

The plain `http` version is useful for calling the API directly, but the front-end expects to use `https`.

### ⚠️ Allow connections to `https://localhost:8088` in your browser. ⚠️

The front-end won't be able to make any requests to the backend unless you allow the self-signed certificate.

## Front-end

Runs on port 5173, as the `frontend` service in the same compose stack.

Then go to [http://localhost:5173](http://localhost:5173)

# Building the extension

The extension is built from `packages/addon`, not from the frontend package:

```sh
lerna run build:dev --scope=addon
```

## Watch and build

`packages/addon` has watch scripts of its own, which also pick up changes in `send-frontend`:

```sh
pnpm --filter addon build:dev:watch     # rebuild the xpi on every change
pnpm --filter addon dev:builtin:local   # rebuild and sync into a local comm-central checkout
```

See the [add-on README](../../addon/README.md) for the built-in / system add-on flow.

# Architecture Overview

- [EngDesignDoc.md](./EngDesignDoc.md) — system overview, terminology, end-to-end encryption and
  access links
- [MultipartUploads.md](./MultipartUploads.md) — how large files are split, uploaded and reassembled
- Sharing is user-to-anonymous only, through access links; there is no user-to-user folder sharing

# Misc database things

Note: You'll want to `docker compose exec backend bash` (from the repo root) before performing any of these operations.

## How to reset the database

```sh
pnpm db:reset
```

## How to update the database

```sh
pnpm db:migrate
```

It will prompt you for a migration name. (We don't yet have a convention, so feel free to make up a name.)

```sh
pnpm db:generate
```

This command updates the typescript types created by the Prisma ORM.
If you're editing any of the backend code with VS Code, you should run `Developer: Reload Window` from the Command Palette.

Schema commands need `DIRECT_DATABASE_URL` as well as `DATABASE_URL`; the container has it, and the [Send README](../README.md#setting-up-the-environment) explains what to do if you run prisma from the host.

## How to browse the database

Prisma Studio is already started alongside the dev server (the backend's `debug` script runs both), so just visit `http://localhost:5555` in your browser. To start it by hand:

```sh
pnpm db:browse
```
