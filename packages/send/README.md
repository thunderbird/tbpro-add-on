## Thunderbird Send

Thunderbird Send is an end-to-end encrypted file sharing solution, allowing you to safely encrypt, password-protect and send files through our [website](https://send.tb.pro/) or from inside Thunderbird Desktop, where it ships as part of the built-in Thundermail add-on (built from [`packages/addon`](../addon/README.md)).

Send is part of [Thundermail](https://thundermail.com/) — or feel free to follow the guide below to run a local or self-hosted version for yourself!

## Getting started

We have a detailed getting started guide in [our wiki](https://github.com/thunderbird/send-suite/wiki)

## Development

To get started, you need to install the dependencies for the monorepo. You can do this by running the following command from the root of the monorepo:

```sh
pnpm install
```

Then run the full stack (you can use this command anytime you want to run the application back
again):

```sh
pnpm run dev:send
```

That is the whole setup. `dev:send` does the two things a fresh checkout is missing before it hands
off to `docker compose`: it creates any absent `.env` by copying the `.env.sample` next to it (they
are gitignored, and compose reads `backend/.env` itself, so without one the stack fails outright
with `env file .../packages/send/backend/.env not found`), and it generates the backend image's
build context. An `.env` you already have is never touched, and a second run has nothing to do.

To *reset* your `.env` files back to the samples there is a separate script. It prompts for a `Y`
and **overwrites** any `.env` already in `frontend/`, `backend/` and `e2e/`:

```sh
pnpm --filter send-suite run setup
```

(There is also a `setup:local`, which flips the public-login flags on afterwards. The samples
ship those flags on, so it does nothing `setup` doesn't; CI still calls it.)

### Setting up the environment

> Upgrade note (existing checkouts): the backend now declares a Prisma
> `directUrl`, so schema commands need `DIRECT_DATABASE_URL` as well as
> `DATABASE_URL`, or they fail with `P1012`. `compose.yml` supplies it to the
> backend container, but add it to `packages/send/backend/.env` too (copy the
> line from `.env.sample`) if you run prisma from the host. Locally there is no
> connection pooler, so it equals `DATABASE_URL`.
>
> Production images no longer run `prisma generate` on boot -- the client is
> generated at image build. The dev entrypoint still regenerates, because
> compose mounts a named volume over `/app/node_modules` that shadows the
> image's client, so a host-side `pnpm db:generate` cannot reach the container.
> After editing `prisma/schema.prisma`, restart the backend service, or run
> `docker compose exec backend pnpm db:migrate`.

#### Internal service-to-service endpoints

The backend exposes read-only internal endpoints for other Thunderbird services
(today: Accounts reading a user's Send storage usage via
`GET /api/internal/users/:sub/storage`). They are authenticated with a static
high-entropy integration key issued by Send, configured through
`INTERNAL_API_KEYS` in `packages/send/backend/.env` as a comma-separated list of
`label:key` pairs (e.g. `accounts:<key1>,accounts-prev:<key2>`). The label
identifies the caller in audit logs and the multi-key form enables zero-downtime
rotation. With no key configured the endpoints fail closed (503); an invalid or
missing key is rejected 401. Keys must be delivered only via a secret store,
never chat or email. See the commented entry in `backend/.env.sample`.

#### Rate limiting

A subset of backend routes (token refresh, authenticated container reads, container and item
mutations, share-link creation and the owner's share-link lookups, upload creation) are rate
limited per user, with the counters kept in Redis so the limit means the same thing across every
backend instance. Sign-in itself and the public share-link/download routes are not limited — see
the design doc for the exact list. It is **opt-in through `REDIS_URL`**: the
sample leaves it empty and `compose.yml` runs no Redis, so locally (and in E2E/CI) the limiter is
a no-op and requests are unlimited. Set `REDIS_URL` to exercise it; once configured, an
unreachable Redis fails closed with `503` rather than letting requests through unlimited. Limits
live in `backend/src/config.ts` (`RATE_LIMITS`: `auth` 10/min, `read` 100/min, `sensitive` 30/min)
and each is overridable with `RL_<TIER>_MAX` / `RL_<TIER>_WINDOW_MS`. Over-limit requests get a
`429` with `Retry-After`, which the frontend's API client honours and retries once. The design
and its rationale are in [`docs/design/rate-limiting-send-backend.md`](../../docs/design/rate-limiting-send-backend.md).

### Loading the TB Extension

> **Out of date.** This describes the old standalone "Thunderbird Send" add-on, which is no longer
> built or shipped — and the build that produced its `.xpi` is broken, so the file you get is missing
> its background script. To work on the add-on, use `packages/addon` and follow
> [its README](../addon/README.md). Removing the leftovers here is tracked in
> [#1243](https://github.com/thunderbird/tbpro-add-on/issues/1243).

Make sure you add your localhost certificate. We have an
[In depth guide](https://github.com/thunderbird/send-suite/issues/190).

To load this in Thunderbird:

- Go to Settings and click `Add-ons and Themes` in the lower left-hand corner
- In the "Manage your Extensions" window, click the gear icon in the upper right and choose `Debug Add-ons`
- On the "Mozilla Thunderbird" page that appears, click the `Load Temporary Add-on...` button in the upper-right.
- Navigate to the root directory and choose the xpi you generated earlier.

### Using the Extension

- After loading the extension, go to Settings and click `Composition` in the left-hand menu.
- Scroll down to "Attachments" and click the `Add Thunderbird Send` button
- In the Thunderbird Send configuration panel, click the `Log into Mozilla Account` button
- In the popup, follow the Mozilla Account login flow
- After you successfully log in, the popup should close (or you can manually close it)

You can now right-click attachments in emails and choose "Convert to Thunderbird Send". You'll be prompted for an optional password to protect the attachment.

Successful conversion results in a "beautiful" link being added to your message body.

Note: the link will only work on your local machine, as the URL is a `localhost` one. (But you should be able to open it in a browser and see that the file downloads and can be viewed).

### Submitting .xpi to ATN

Nothing is submitted to ATN any more. The add-on ships inside Thunderbird as the built-in system
add-on, built from `packages/addon` — see the root [README](../../README.md#deployment) for how a
release is cut. This section and the two above it describe the old standalone "Thunderbird Send"
add-on, which is no longer built or published; removing what is left of it is tracked in
[#1243](https://github.com/thunderbird/tbpro-add-on/issues/1243).

### Public login

Local password login — registering an account on your own stack, no Mozilla Account involved — is
on by default: both `.env.sample` files ship `ALLOW_PUBLIC_LOGIN=true` and
`VITE_ALLOW_PUBLIC_LOGIN=true`. Set them to `false` in `packages/send/backend/.env` and
`packages/send/frontend/.env` to require OIDC instead.

### Using the webapp

- Visit `https://localhost:8088/` and accept the self-signed certificate
  - In Firefox, you'll want to add an exception for this certificate
- Then, you can open `http://localhost:5173/`
- Click the `Profile` link in the sidebar and click `Log into Moz Acct`
- After logging in, go to `My Files` in the sidebar

From here, you can do things like create folders, upload files to folders, and create share links. (Note that the share links will only be valid on your machines, since they'll have `localhost` addresses.)

## TB Extension

### Building the TB Extension for development

If this is the first time you're building the extension, you'll need to install the tooling on the host:

```sh
# Install frontend dependencies
pnpm i --filter send-frontend
```

Build the web app:

```sh
lerna run build:web --scope=send-frontend
```

`build:dev` and `build` additionally run the old standalone add-on build, which is dead and broken —
see [#1243](https://github.com/thunderbird/tbpro-add-on/issues/1243). For add-on development, build
`packages/addon` instead.

## Sentry

Make sure you ask the team for `VITE_SENTRY_AUTH_TOKEN`

## Debugging

### VSCode debugger for the backend

You can use VSCode's debugger for the backend. The dev container already starts node with
`--inspect=0.0.0.0:9229` (the `debug` script in `backend/package.json`, run by `scripts/entry.sh`),
and `compose.yml` publishes that port, so all that is left is attaching.

1. Add this to your `.vscode/launch.json`. The paths assume you opened the repo root in VSCode;
   if you opened `packages/send` instead, shorten `localRoot` to `${workspaceFolder}/backend`.

```
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "localRoot": "${workspaceFolder}/packages/send/backend",
      "name": "Docker: Attach to Node",
      "remoteRoot": "/app"
    },
  ]
}

```

3. From the root, run `pnpm run dev:send`

4. Run your debug session. If you have multiple configs, make sure you run the one called `Docker: Attach to Node`

### VSCode debugger for the frontend

1. Run this command `code packages/send/frontend` (from the repo root) to open a session on the frontend package.

2. Add this to your `.vscode/launch.json` file:

```
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:5173/send",
      "skipFiles": [
        "<node_internals>/**",
        "${workspaceFolder}/node_modules/**/*.js"
      ],
      "enableContentValidation": false,
      "webRoot": "${workspaceFolder}/src",
      "pathMapping": { "url": "/src/", "path": "${webRoot}/" }
    }
  ]
}

```

3. Start a new debugging session. This will open a new chrome window that is connected to your VSCode session. Now you can add breakpoints and do all sorts of magic.

## Testing

### Backend tests

`pnpm test` from `packages/send/backend`.

One suite needs a bucket to talk to. `src/test/storage/presigned-roundtrip.test.ts`
covers the path production takes for a file — a presigned PUT, a size read back,
a presigned GET, a delete — so it moves real bytes over HTTP rather than
stubbing the S3 client. `docker compose up` already starts that bucket — it is the
MinIO service the dev stack itself uploads to, so there is no separate step.

It holds nothing but test objects and costs nothing to start, so the suite
requires it rather than skipping when it is missing, and says so if nothing
answers. The connection settings are the compose service's own and are built into
the suite as defaults, so an existing checkout needs no `.env` change. If another
worktree is already using port 9000, start the stack with `SEND_MINIO_PORT=9010`
and set `TEST_MINIO_ENDPOINT=http://localhost:9010` and
`S3_PUBLIC_ENDPOINT=http://localhost:9010` in `packages/send/backend/.env`.

### Dev-stack tooling

`scripts/test-dev-send.sh`, from the repo root, covers `dev-send.sh`: which `.env` files it creates,
that it leaves an existing one alone, and that a second run still starts the stack. It runs against
a throwaway fixture tree with a stub `docker`, so it starts no containers and takes about a second.

### E2E testing

For details on how to run the E2E tests please see the [E2E Tests README](e2e/README.md).

## Releasing

In order to keep track of our releases, we need to bump the versions in the `frontend` and `backend` `package.json` files whenever we change them. The usual way is the `Bump Package Versions` workflow in the repo's Actions tab: it runs [`scripts/bump-versions.js`](../../scripts/bump-versions.js), which bumps the patch version of every package in the monorepo together with the add-on and frontend `manifest.json` files, and opens a PR with the result. To bump a single package by hand instead, move to its directory and run `pnpm version patch` (you can use minor or major depending on your needs). The frontend requires its `public/manifest.json` to match, which its `postversion` hook (`scripts/bump.ts`) takes care of; the backend has no companion file to keep in sync — the image tag the deployment runs is written into the task definition by the deploy workflow, not read from a config file. How a tagged release is cut from these versions is described in the root [README](../../README.md#deployment).

## Storage

Every upload is a presigned PUT from the browser straight to a bucket, so the
backend needs one — there is no filesystem backend to fall back on.
`STORAGE_BACKEND` is `b2` or `s3`, and anything else throws at boot. Locally
`.env.sample` sets `s3` and points it at the MinIO service in `compose.yml`,
which needs no account and no credentials. That service runs
[Silo](https://silo.pgsty.com/), the community-maintained fork of MinIO: MinIO no
longer publishes its open-source images, and Silo speaks the same API and reads
the same `MINIO_*` settings, so everything here still calls it MinIO.

Because the browser reaches MinIO at a different address than the backend does
(`localhost:9000` published, `minio:9000` on the compose network) and a presigned
URL is only valid for the host it was signed for, `S3_PUBLIC_ENDPOINT` says which
address to sign with. Production leaves it empty: one host serves both.

In deployed environments we're using Backblaze for our storage buckets.

We're uploading/downloading directly to the bucket using signed urls. In order for us to avoid CORS issues, we have to configure the buckets correctly.

Using the `b2` CLI, run the authorization command:

`b2 account authorize`

This will prompt for your credentials. Make sure you use the master key and not a specific bucket key as it won't work.

To confirm that it worked, list the buckets from the account.
`b2 ls`

Move to the b2 rules directory
`cd packages/send/backend/b2`

Update the rules
`b2 bucket update {YOUR_BUCKET_NAME} --cors-rules "$(<./rules.json)"`

Updating retention rules
`b2 bucket update {YOUR_BUCKET_NAME} --lifecycle-rule "$(<./retention.json)"`

### Troubleshooting Send

Sometimes npm packages get screwed you come back to the project after a while. You can have a clean run by running.

All of these run from the **repo root** — `compose.yml` lives there, not in `packages/send`.

```sh
lerna clean
docker compose down -v
docker system prune -a --volumes
pnpm i
lerna run bootstrap   # host-side backend deps + prisma client
pnpm run dev:send     # regenerates the backend's .docker-build build context itself
```

If you're having any issues with docker (ex: no memory left, or volumes do not contain expected files), prune docker and rebuild containers from scratch:

```sh
docker compose down -v
docker system prune -a --volumes
lerna run bootstrap
docker compose build --no-cache
```

Then run

```sh
docker compose up -d
```

Everything should run well now

When you're done with the project, you can run:

```sh
docker compose down -v
```

This stops containers and removes containers, networks, volumes, and images created by `dev`.

Note: All named volumes are persisted. You can see these expressed as `volumes` on the `compose.yml` file.
