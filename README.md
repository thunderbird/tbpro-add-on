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

Don't skip `bootstrap`. Besides installing the backend's dependencies it generates the Prisma
client and, through `packages/send/backend/scripts/build.sh`, the backend's Docker build context
at `packages/send/backend/.docker-build`. That directory is generated rather than checked in, so
without it the first `pnpm run dev:send` fails with
`unable to prepare context: path ".../packages/send/backend/.docker-build" not found`. Re-run
`lerna run bootstrap` (or just `pnpm --filter send-backend run build:image`) after changing
anything under `packages/send/backend`.

Next, create your `.env` files:

```sh
pnpm --filter send-suite run setup
pnpm --filter addon run setup
```

Both prompt for a `Y` and then **overwrite** any `.env` you already have in those packages, so
back yours up first if it holds anything you care about. Two footguns:

- Keep the `run`. `pnpm --filter send-suite setup` matches pnpm's own `setup` command and fails
  with `Unknown option: 'recursive'`.
- Don't pipe the `Y` into `lerna run setup` — the prompt never reaches the script and the command
  hangs. Use the `pnpm ... run setup` form above in scripts.

Finally, run the full stack (you can use this command anytime you want to run the application back again):

```sh
pnpm run dev:send
```

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

Every time you merge to the `main` branch, a new version of the application is automatically deployed to our staging environments. This is done through GitHub Actions and you can see the workflow [here](./.github/workflows/merge.yml). To ensure that our deployments are consistent, you have to bump the version of the packages you changed in their respective `package.json` files. In the case of the addon, you also need to update the version in `packages/addon/manifest.json` file to match the version set on `package.json`.

## Releasing a new version to production

After validating that the changes work as expected on staging, you can create a new release on GitHub. This is currently a manual process. Creating the release will trigger the `release.yml` workflow that publishes the new version of the application to production. You can see the workflow [here](./.github/workflows/release.yml).

Before publishing the release, upload the production assets built by the merge workflow. You can find the artifacts [here](https://github.com/thunderbird/tbpro-add-on/actions/workflows/merge.yml). The release workflow currently expects these assets to be attached to the manually created GitHub release:

- `ecr_tag.zip`
- `dist-web-prod.zip`
- `tbpro-addon-prod-*.xpi`

Once you create the release with those assets attached, the workflow will deploy the new version to production and publish the addon to ATN.

If for some reason there is an issue with the add-on release, you can manually upload the xpi file to ATN [here](https://addons.thunderbird.net/).

### Release versioning

Although we're using semantic versioning for our packages, the release workflow is using the version set by the [send package](./packages/send/package.json). Until we have a more robust release process, we will be using the send package version as the source of truth for our releases. This means that every time we want to release a new version, we have to update the version in `packages/send/package.json` file and make sure to update the version in `packages/addon/manifest.json` file to match it.

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

