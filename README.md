# TB Pro Addon

Welcome to the TB Pro Addon monorepo! It is meant to house all the projects that are combined to create the tbpro addon.
The packages inside this monorepo are:

- `send-suite`: The main package that contains the Thunderbird Send webapp and extension. It contains the dependencies to test the webapp using playwright and the backend using vitest.
- `send-frontend`: The frontend code for the Thunderbird Send webapp. It is a Vite app that uses Vite as a build tool.
- `send-backend`: The backend code for the Thunderbird Send webapp. It is a Node.js app that uses Express as a web server and postgres as a database.
- `addon`: The Thunderbird Send extension code. This puts everything together and outputs a single xpi (addon package). It depends on `send-frontend` to build.

This includes the Thunderbird Send webapp and the Thunderbird Send extension.
This monorepo is managed using [Lerna](https://lerna.js.org/) and [pnpm](https://pnpm.io/).

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) 22.x — `engines` requires `>=22.11.0`. Stay on 22: on Node 24 `playwright install` hangs unpacking the browser archives ([nodejs/node#63487](https://github.com/nodejs/node/issues/63487)).
- [pnpm](https://pnpm.io/installation) (v10.6.4 or later)
- [bun](https://bun.sh/) (v1.1.13) — a handful of package scripts run through it (`compare_envs`, the frontend and add-on build scripts), so the repo needs it even though it is not the package manager
- [Docker](https://www.docker.com/get-started/) with the [Compose](https://docs.docker.com/compose/install/) plugin
- `rsync`, `jq` and `zip` — the backend's Docker build context and the add-on/frontend builds shell out to these (preinstalled on macOS and most Linux distros)

## Environment setup

Install the package managers `bun` and `pnpm` globally. You can do this using npm:

```sh
npm install -g bun
npm install -g pnpm
# lerna is a dev dependency of the repo, so `pnpm exec lerna ...` always works. Installing it
# globally just lets you type the bare `lerna ...` commands used throughout these docs.
pnpm install -g lerna
```

Or alternatively

```sh
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

To get started, you need to install the dependencies for the monorepo. You can do this by running the following command from the root of the monorepo:

```sh
pnpm install --filter @thunderbird/tbpro-add-on && lerna run bootstrap
```

`bootstrap` installs the backend's dependencies and generates the Prisma client, which is what
host-side backend commands (`pnpm typecheck`, `pnpm test`, prisma) need. It is not a prerequisite
for starting the stack.

Then run the full stack (you can use this command anytime you want to run the application back
again):

```sh
pnpm run dev:send
```

That is all the Send stack needs. `dev:send` copies any missing `.env` from its `.env.sample` and
regenerates the backend's Docker build context before calling `docker compose`, so a fresh checkout
or a new worktree comes up on one command. Both are files that are generated rather than checked
in, which is why they used to have to be created by hand first. An `.env` you already have is left
untouched.

The add-on has its own `.env`, which is not part of the stack and is still copied by hand:

```sh
pnpm --filter addon run setup
```

It prompts for a `Y` and then **overwrites** any `.env` you already have in that package, so back
yours up first if it holds anything you care about. Two footguns, which also apply to
`pnpm --filter send-suite run setup` (the script that *resets* the Send `.env` files):

- Keep the `run`. `pnpm --filter addon setup` matches pnpm's own `setup` command and fails
  with `Unknown option: 'recursive'`.
- Don't pipe the `Y` into `lerna run setup` — the prompt never reaches the script and the command
  hangs. Use the `pnpm ... run setup` form above in scripts.

Congrats! Now you should be able to see the app on `http://localhost:5173/` and the backend running on `https://localhost:8088/`

The backend is served over TLS with a self-signed certificate. Visit `https://localhost:8088/`
once and accept it, or the app will load while every API call quietly fails.

In order to login, you must create a new account. Click the "Or register" link and follow the prompts to create an account, which will then log you in to your local instance of Send.

## Addon

### Building locally

To build the addon locally, you need to install **all** the packages in the monorepo. This is because the backend needed for most operations is inside the `send-backend` package and the rest of the packages contain dependencies to build the addon. You can do this by running the following command from the root of the monorepo:

```sh
# Install all dependencies
pnpm install
```

Build the addon

```sh
lerna run build --scope=addon
```

That produces an xpi you can load by hand. To test the add-on the way Thunderbird ships it — as the
built-in system add-on inside a local Thunderbird build — see
[the add-on README](./packages/addon/README.md#testing-as-the-built-in--system-add-on-local-comm-central-build).

## Pre-commit hooks

We use `lint-staged` + `husky` to run prettier and eslint on staged files.

The shell script lives on [.husky/pre-commit](./.husky/pre-commit)

### Testing hooks

Add this line to the end of [.husky/pre-commit](./.husky/pre-commit)

`exit 1`

Make sure you commit a file you want to run `lint-staged` on

Run this command:

```
git commit -m "testing pre-commit code"
# A commit will not be created
```

You should see the output of the hook as if you actually commited your files.

### Skipping hooks

If for some reason you're confident on a change and would like to skip pre-commit hooks. Add `--no-verify` at the end of your commit command.

### More about hooks

[Here](https://typicode.github.io/husky/how-to.html#testing-hooks-without-committing) you can read more.

### Authentication

We're using jwt tokens to authenticate users. Once they go through the login flow, they get a jwt token that is stored as a secure cookie. This is passed on every request to the backend automatically. We use this token to know who is making the request and by decoding it we get user data such as userId and email. We can set how many days the token is valid for and once it expires, the user has to log in again.

# Deployment

## Releasing a new version (stage)

Every time you merge to the `main` branch, a new version of the application is automatically deployed to our staging environments. This is done through GitHub Actions and you can see the workflow [here](./.github/workflows/merge.yml). To ensure that our deployments are consistent, you have to bump the version of the packages you changed in their respective `package.json` files. In the case of the addon, you also need to update the version in `packages/addon/public/manifest.json` file to match the version set on `package.json`.

## Releasing a new version to production

After validating that the changes work as expected on staging, run the
[`create-release`](./.github/workflows/create-release.yml) workflow from the Actions tab. It takes
the production artifacts a `main` build already produced, attaches them to a draft GitHub release,
and works the tag out from `packages/addon/public/manifest.json`. Publishing that draft is what
triggers the [`release.yml`](./.github/workflows/release.yml) workflow that deploys to production, so
it doubles as the confirmation step — unless you tick the workflow's `publish` input, which skips the
draft and releases straight away.

It attaches whichever of these the source build produced; the frontend and backend assets are skipped
when that part of the codebase did not change:

- `ecr_tag.zip` — the backend image tag
- `dist-web-prod.zip` — the Send web bundle
- `tbpro-system-add-on-prod-*.xpi` — the system add-on

The add-on is no longer published to ATN. The system add-on ships inside Thunderbird, so the
`.xpi` on the release is the hand-off to comm-central rather than something CI uploads anywhere.

### Release versioning

We use semantic versioning for the packages, but a release is tagged from a single source of truth:
the version in [`packages/addon/public/manifest.json`](./packages/addon/public/manifest.json). That is
the file `create-release` reads to work out the tag. So before releasing, make sure that version is
the one you mean, and that the packages you changed have had their own `package.json` versions bumped
to match.

## Monorepo

### Project management

Each project inside the `packages` folder, contains a `package.json` where the `name` is used as the reference for command execution (we'll call this the package name). Each package is declared inside the `pnpm-workspace.yaml` and `lerna.json` files.

## Install all dependencies

If you run `pnpm install` from the root. This command will install **all the dependencies** for all the packages inside the workspace.

## Install partial dependencies

If you want to install only the dependencies for the projects you need, you can run the filter command and pass a glob pattern matching the ones you want. For example. If you want to install all dependencies for `send`, you can run

`pnpm install --filter "send-*"`

This will only install the dependencies where the package name starts with `send-`.

## Running commands

_Note: Make sure you install the dependencies you need before running your commands._

You can run any package's commands by running the following:

`lerna run <your-command> --scope=<package-name>`

For example, if I want to build the add-on, I can run

`lerna run build --scope=addon`

The `lerna run ... --scope=<package>` form works from anywhere, because it runs the script inside
that package. A bare `pnpm exec playwright`, by contrast, only resolves inside
`packages/send/e2e`. See the [E2E README](./packages/send/e2e/README.md) for the E2E suites.

