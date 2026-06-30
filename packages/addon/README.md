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
