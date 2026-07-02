# Building the Addon Locally

To build the addon locally, you need to install **all** the packages in the monorepo. This is because the backend needed for most operations is inside the `addon-backend` package and the rest of the packages contain dependencies to build the addon. You can do this by running the following command from the root of the monorepo:

```sh
# Install all dependencies
pnpm install
```

Build the addon

```sh
lerna run build:dev --scope=addon
```

This outputs an xpi file at `packages/addon`, you should see something like `tbpro-add-on-0.1.23.xpi`.

You can use this xpi file to install the addon in your Thunderbird for testing.

## Testing as the built-in / system add-on (local comm-central build)

The standalone xpi above runs under the standalone add-on id (`tbpro-add-on@thunderbird.net`).
To test the add-on the way Thunderbird ships it — as the **built-in / system add-on**
(id `tbpro-system-add-on@thunderbird.net`, loaded from `resource://builtin-addons/thundermail/`,
enabled by default, no install flow) — sync a system-id build into a local comm-central checkout and
rebuild Thunderbird.

The add-on is vendored in comm-central at
`comm/mail/extensions/builtin-addons/thundermail/extension/` and packaged into `messenger.jar` via
that directory's `jar.mn`. These scripts refresh that copy from this repo's `dist/`:

```sh
# Point at your comm-central source root (the dir containing the `comm/` subdir). Required.
export TB_COMM_SRC=/path/to/your/tb-build/source

# One-shot: build with the system id + rsync into the comm tree
pnpm --filter addon sync:builtin

# …or watch mode: auto re-syncs on every source change
pnpm --filter addon dev:builtin
```

### Pointing the built-in add-on at a local backend

By default a system build bakes in the prod/stage Send hosts from your `.env`. To build the
**same system add-on** but wired to a locally running Send backend + client, use the `:local`
variants:

```sh
# One-shot: system-id build against localhost + rsync into the comm tree
pnpm --filter addon sync:builtin:local

# …or watch mode
pnpm --filter addon dev:builtin:local

# (or just build, without syncing)
pnpm --filter addon build:dev:system:local
```

These set `ADDON_ENV=local`, which makes `scripts/build.sh` build in Vite's **development** mode
(so `import.meta.env.MODE === 'development'` — the frontend then probes the local backend for its
storage type instead of assuming bucket storage, and prod Sentry stays off) and force the localhost
URLs into the bundle:

- `VITE_SEND_SERVER_URL=https://localhost:8088` (also used for `wss://…/api/ws` uploads)
- `VITE_SEND_CLIENT_URL=http://localhost:5173`
- `VITE_OIDC_ROOT_URL=https://auth-stage.tb.pro/realms/tbpro/` (no local Keycloak needed)

They're exported as `VITE_*` process env vars, which Vite's `loadEnv` prioritizes over `.env`, so
they win over the prod block your `.env` ends with. Override any of them inline if your local ports
differ, e.g. `VITE_SEND_SERVER_URL=https://localhost:9000 pnpm --filter addon build:dev:system:local`.

**CORS is already handled** — the Send backend auto-allows any `moz-extension://` origin
(`packages/send/backend/src/origins.ts`), and the built-in/system add-on still runs under a
`moz-extension://` origin, so its requests pass CORS with no add-on-side change. Just make sure the
local backend has `SEND_BACKEND_CORS_ORIGINS` set (it throws on startup otherwise) and including
`http://localhost:5173`.

**The self-signed cert is the real gotcha.** The Send dev stack serves `https://localhost:8088`
through the tls-dev-proxy (`packages/send/backend/tls-dev-proxy/`) using a self-signed cert.
Thunderbird's extension `fetch` can't skip cert validation and gets no interactive prompt at
startup, so an untrusted cert fails the TLS handshake — and Gecko reports that as
`CORS request did not succeed` with `Status code: (null)` (a misleading message: it is *not* a CORS
rejection, which would carry a real status and an "Access-Control-Allow-Origin missing" error). Pick
one of these:

- **Trust the cert at the OS level (recommended — survives `--temp-profile`, keeps `wss` uploads
  working).** Import the proxy cert into the macOS keychain and enable Gecko's enterprise-roots
  support per run:

  ```sh
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \
    packages/send/backend/tls-dev-proxy/certs/localhost.crt
  ./mach run --temp-profile --setpref security.enterprise_roots.enabled=true
  ```

  `enterprise_roots` makes Gecko read the macOS keychain; passing it as a `--setpref` means it
  applies even to a fresh temp profile.

- **Add a permanent cert exception in a persistent profile.** Thunderbird → Settings → Privacy &
  Security → Certificates → Manage Certificates → *Servers* → Add Exception → `https://localhost:8088`.
  Downside: a `--temp-profile` run discards it, which fights the stale-cache advice below — use a
  named profile (`./mach run -P <profile>`) instead.

- **Skip TLS entirely (fastest; breaks `wss` uploads).** Point the add-on at the plain-HTTP backend
  on `:8080`. `http://localhost` is a trustworthy secure context in Gecko, so there's no cert and no
  mixed-content block, and it works with `--temp-profile`:

  ```sh
  VITE_SEND_SERVER_URL=http://localhost:8080 pnpm --filter addon build:dev:system:local
  ```

  Caveat: the file-upload WebSocket is hardcoded to `wss://` (`send/frontend/src/lib/helpers.ts`), so
  uploads fail over plain http; trpc / auth / storage-type / dashboard all work.

Then, in the comm tree, repackage and run:

```sh
cd "$TB_COMM_SRC"
./mach build faster      # repackages messenger.jar + regenerates built_in_addons.json
./mach run --temp-profile  # fresh profile each launch — avoids stale built-in caches
```

Notes:

- `build:dev:system` rewrites only the built `dist/manifest.json` to the system id (via
  `scripts/set-system-id.ts`); the source `public/manifest.json` keeps the standalone id.
- The absolute `url(/fonts/...)` → relative rewrite that the built-in CSS needs (Bug 2036665) is
  already handled by `scripts/build.sh`, so the synced build passes Thunderbird's
  `browser_parsable_css.js` static check.
- Use `--temp-profile` after rebuilds; a stale `addonStartup.json.lz4` / startup cache can otherwise
  drop or mis-resolve the built-in (Bugs 1651838 / 1964408).
