## Thunderbird Send

Thunderbird Send is an end-to-end encrypted file sharing solution, allowing you to safely encrypt, password-protect and send files through our [website](https://send.tb.pro/) or as an [add-on](https://addons.thunderbird.net/en-US/thunderbird/addon/tb_send/?src=search) for your Thunderbird Desktop application.

Currently, we are in a closed alpha state. Meanwhile, please join our [waitlist](https://tb.pro/) to try it out during our beta period, or feel free to follow the guide below to run a local or self-hosted version for yourself!

## Getting started

We have a detailed getting started guide in [our wiki](https://github.com/thunderbird/send-suite/wiki)

## Development

To get started, you need to install the dependencies for the monorepo. You can do this by running the following command from the root of the monorepo:

```sh
pnpm install
```

Then create the `.env` files. They are gitignored, so a fresh checkout has none, and the stack
will not start without `backend/.env` — compose reads it directly and fails with
`env file .../packages/send/backend/.env not found`. This prompts for a `Y` and **overwrites** any
`.env` already in `frontend/`, `backend/` and `e2e/`:

```sh
pnpm --filter send-suite run setup
```

(There is also a `setup:local`, which flips the public-login flags on afterwards. The samples
ship those flags on, so it does nothing `setup` doesn't; CI still calls it.)

Finally, run the full stack (you can use this command anytime you want to run the application back again):

```sh
pnpm run dev:send
```

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

### Loading the TB Extension

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

Make sure you have a file named `.env.production` inside the frontend directory that contains the environment variables for production. Otherwise this will fail.

Run

```sh
lerna run build --scope=send-frontend
```

This will create `frontend-source.zip` use it to upload to ATN when asked for source code.
It will also move your `.xpi` to the `packages/send` directory.

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

Build the extension:

```sh
lerna run build:dev --scope=send-frontend
```

This outputs an xpi file at `packages/send`, named after the version in
`packages/send/frontend/package.json` with the dots replaced by hyphens — at 8.0.6 that is
`send-suite-8-0-6.xpi`.

## Sentry

Make sure you ask the team for `VITE_SENTRY_AUTH_TOKEN`

## Debugging

### VSCode debugger for the backend

You can use VSCode's debugger for the backend.

1. Add this to your `.vscode/launch.json`

```
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "localRoot": "${workspaceFolder}/backend",
      "name": "Docker: Attach to Node",
      "remoteRoot": "/app"
    },
  ]
}

```

3. From the root, run `pnpm run dev:send`

4. Run your debug session. If you have multiple configs, make sure you run the one called `Docker: Attach to Node`

### VSCode debugger for the frontend

1. Run this command `code frontend` to open a session on the frontend package.

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
stack already holds port 9000, see
[Running a second stack in parallel](#running-a-second-stack-in-parallel).

### E2E testing

For details on how to run the E2E tests please see the [E2E Tests README](e2e/README.md).

## Running a second stack in parallel

You can run a second Send stack — a git worktree, or another checkout — next to the one already
running, as long as you move the published host ports. Container-internal ports never change;
only the host side of each mapping does.

### 1. Pick a port map

Only MinIO's host port is configurable through the environment (`SEND_MINIO_PORT`); the rest are
hardcoded in `compose.yml`, so they move via a compose override. Check a candidate with
`lsof -nP -iTCP:<port> -sTCP:LISTEN`.

| service             | container | default host port | example second stack |
| ------------------- | --------- | ----------------- | -------------------- |
| frontend (vite)     | 5173      | 5173              | 5873                 |
| reverse-proxy (TLS) | 12345     | 8088              | 8988                 |
| backend             | 8080      | 8080              | 8880                 |
| prisma studio       | 5555      | 5555              | 6155                 |
| node debugger       | 9229      | 9229              | 9829                 |
| postgres            | 5432      | 5432              | 6832                 |
| minio               | 9000      | 9000              | 9300                 |

### 2. Add a `compose.override.yml` at the root of the second checkout

Compose loads a file with this exact name automatically, with no flag — which is also why it must
never be committed. It is **not** in the tracked `.gitignore`, so exclude it locally yourself
(this path resolves from a worktree too, and covers every worktree of the clone):

```sh
f="$(git rev-parse --git-common-dir)/info/exclude"
grep -qxF compose.override.yml "$f" || echo compose.override.yml >> "$f"
```

`!override` (Compose v2.24.4+ — older 2.24.x parses the file and ignores the tag) replaces the
base `ports:` list instead of appending to it.

```yaml
services:
  db:
    ports: !override
      - "6832:5432"
  backend:
    ports: !override
      - "8880:8080"
      - "6155:5555"
      - "9829:9229"
  reverse-proxy:
    ports: !override
      - "8988:12345"
  frontend:
    ports: !override
      - "5873:5173"
  minio:
    ports: !override
      - "127.0.0.1:9300:9000"
```

Putting MinIO's port here rather than exporting `SEND_MINIO_PORT` is deliberate: an env var only
applies to the shell that exported it, so the next `docker compose up` you type without it rebinds
9000 and collides with the other stack.

### 3. Point the `.env` files at the new ports

After `pnpm --filter send-suite run setup`, four keys actually matter:

| file            | key                         | value                                         |
| --------------- | --------------------------- | --------------------------------------------- |
| `backend/.env`  | `SEND_BACKEND_CORS_ORIGINS` | `http://localhost:5873,http://localhost:4173` |
| `backend/.env`  | `S3_PUBLIC_ENDPOINT`        | `http://localhost:9300`                       |
| `frontend/.env` | `VITE_SEND_SERVER_URL`      | `https://localhost:8988`                      |
| `frontend/.env` | `VITE_SEND_CLIENT_URL`      | `http://localhost:5873`                       |

`S3_PUBLIC_ENDPOINT` is the address the _browser_ uses: uploads are presigned PUTs straight to the
bucket, and a presigned URL is only valid for the host it was signed for. Set
`TEST_MINIO_ENDPOINT` to the same value if you also run the backend's storage suite.

Worth knowing so you don't debug the wrong file: `BASE_URL` only needs to be set, not correct — the
backend just substring-matches it against the deployed hostnames. `VUE_BASE_URL` is read by
nothing. And the dev E2E suite ignores `e2e/.env` entirely (see the
[E2E README](e2e/README.md)). Set them for consistency, but they change no behaviour locally.

Leave `DATABASE_URL` and `S3_ENDPOINT` alone — those addresses are internal to the compose network.

### 4. Bring it up with its own project name

```sh
pnpm install                                    # a fresh worktree has no node_modules
lerna run bootstrap                             # generates packages/send/backend/.docker-build
BUILD_ENV=production docker compose -p send-second up -d --build   # same env pnpm dev:detach uses
```

Pass `-p` to every later `docker compose` command too (`logs`, `ps`, `down`). Without it the
project name falls back to the directory name, and one forgotten `-p` gets you a second set of
containers fighting for the same ports.

### 5. Run the E2E suite against it

The `test:e2e*` scripts all target port 5173, so pass the base URL in yourself. Run this from
`packages/send/e2e` — a bare `pnpm exec playwright` does not resolve anywhere else:

```sh
cd packages/send/e2e
PLAYWRIGHT_BASE_URL=http://localhost:5873 pnpm exec playwright test \
  --config playwright.config.dev.ts --grep dev-desktop
```

### Things that will silently test the _other_ stack

Each of these produces a green-looking run against the wrong stack:

- `test:e2e:ci` — `scripts/e2e.sh` hardcodes `PLAYWRIGHT_BASE_URL=http://localhost:5173` and
  probes ports 5173/8088. It cannot be pointed elsewhere; use the explicit invocation above.
- `test:e2e`, `test:e2e:headless`, `test:e2e:ui` — none of them set a base URL, so the config falls
  back to `http://localhost:5173`. (All four are `send-suite-e2e` scripts, run either from
  `packages/send/e2e` or as `lerna run <script> --scope=send-suite-e2e`.)
- any `docker compose` command without `-p`.
- a stale `S3_PUBLIC_ENDPOINT` — uploads then go to the other stack's bucket.
- a locally-edited `packages/send/frontend/public/config.js`: `window.__APP_CONFIG__` is read
  _before_ the values baked in from `.env`, so anything in there wins. The committed file is
  intentionally empty.

To confirm which stack you actually exercised, watch both backends and both databases:

```sh
docker compose -p send-second logs -f --tail=0 backend      # traffic should appear only here
docker compose -p send-second exec db psql -U postgres -d send-suite -tAc 'select count(*) from "User";'
```

### Teardown

```sh
docker compose -p send-second down -v
```

## Releasing

In order to keep track of our releases, we need to set our versions on either the `frontend` or `backend` package.json. To bump the version, move to the directory and run `pnpm version patch` (you can use minor or major depending on your needs). This will bump the version number on package.json and the related files that need updating. The backend requires `config.stage.yaml` to match the version number, whereas the frontend requires `manifest.json` to match. This is done automatically as long as you handle the version via `pnpm version`

## Storage

Every upload is a presigned PUT from the browser straight to a bucket, so the
backend needs one — there is no filesystem backend to fall back on.
`STORAGE_BACKEND` is `b2` or `s3`, and anything else throws at boot. Locally
`.env.sample` sets `s3` and points it at the MinIO service in `compose.yml`,
which needs no account and no credentials.

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
docker compose down
docker system prune -a --volumes
pnpm i
lerna run bootstrap   # regenerates the backend's .docker-build build context
pnpm run dev:send
```

If you're having any issues with docker (ex: no memory left, or volumes do not contain expected files), prune docker and rebuild containers from scratch:

```sh
docker compose down
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
docker compose down
```

This stops containers and removes containers, networks, volumes, and images created by `dev`.

Note: All named volumes are persisted. You can see these expressed as `volumes` on the `compose.yml` file.
