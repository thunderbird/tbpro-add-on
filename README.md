# TB Pro Addon

Welcome to the TB Pro Addon monorepo! It is meant to house all the projects that are combined to create the tbpro addon.
The packages inside this monorepo are:

- `tbpro-shared`: Shared code and utilities used across the Thunderbird Send js apps.
- `send-suite`: The main package that contains the Thunderbird Send webapp and extension. It contains the dependencies to test the webapp using playwright and the backend using vitest.
- `send-frontend`: The frontend code for the Thunderbird Send webapp. It is a Vite app that uses Vite as a build tool.
- `send-backend`: The backend code for the Thunderbird Send webapp. It is a Node.js app that uses Express as a web server and postgres as a database.
- `addon`: The Thunderbird Send extension code. This puts everything together and outputs a single xpi (addon package). It depends on `send-frontend` and `tbpro-shared` to build.

This includes the Thunderbird Send webapp, the Thunderbird Send extension, and the shared code between them.
This monorepo is managed using [Lerna](https://lerna.js.org/) and [pnpm](https://pnpm.io/).

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) (v22 or later)
- [Docker](https://www.docker.com/get-started/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [pnpm](https://pnpm.io/installation) (v8 or later)

## Environment setup

Install the package managers `bun` and `pnpm` globally. You can do this using npm:

```sh
npm install -g bun
npm install -g pnpm
```

Or alternatively

```sh
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

To get started, you need to install the dependencies for the monorepo. You can do this by running the following command from the root of the monorepo:

```sh
pnpm install
```

You can run the setup automatically with

```sh
lerna run setup --scope=send-suite
lerna run setup --scope=addon
```

Then edit the `packages/send/backend/.env` file to supply values for the FXA_CLIENT_ID and FXA_CLIENT_SECRET vars

Finally, run the full stack (you can use this command anytime you want to run the application back again):

```sh
pnpm run dev:send
```

Congrats! Now you should be able to see the app on `http://localhost:5173/` and the backend running on `https://localhost:8088/`

In order to login, you must create a new account. Click the "Or register" link and follow the prompts to create an account, which will then log you in to your local instance of Send.

This will install all the dependencies for all the packages in the monorepo.

```sh
pnpm run dev:send
```

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

## Prerequisites

Make sure you install [docker](https://www.docker.com/get-started/) for local development.

If you're developing changes to the our account workflow, you'll need the following to run the server and use the client:

- An account on the FXA staging server
- The client id and secret for the FXA staging server (in 1Password, in the Services vault)

Finally, install the dependencies (this command will install both frontend and backend)

```sh
pnpm install
```

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

See the `docs/` folder for a draft of the detailed documentation.

[Here](https://typicode.github.io/husky/how-to.html#testing-hooks-without-committing) you can read more.

### Authentication

We're using jwt tokens to authenticate users. Once they go through the login flow, they get a jwt token that is stored as a secure cookie. This is passed on every request to the backend automatically. We use this token to know who is making the request and by decoding it we get user data such as userId and email. We can set how many days the token is valid for and once it expires, the user has to log in again.

## Monorepo

## Project management

Each project inside the `packages` folder, contains a `package.json` where the `name` is used as the reference for command execution (we'll call this the package name). Each package is declared inside the `pnpm-workspace.yaml` and `lerna.json` files.

## Install all dependencies

If you run `pnpm install` from the root. This command will install **all the dependencies** for all the packages inside the workspace.

## Install partial dependencies

If you want to install only the dependencies for the projects you need, you can run the filter command and pass a glob pattern matching the ones you want. For example. If you want to install all dependencies for `send`, you can run

`pnpm install --filter "send-*"`

This will only install the dependencies where the package name starts with `send-`.

## Running commands

_Note: Make sure you install the dependencies you need before running your commands._

You can run any package's commands by calling.

`lerna run <your-command> --scope=<package-name>`

For example, If I want to run e2e tests on send, I can run

`lerna run test:e2e:ci --scope=send-suite`

### Packages

#### tbpro-shared

The `tbpro-shared` package contains shared code and utilities used across the Thunderbird Send add-on. This package is designed to be used as a dependency by other packages in the monorepo.

**Key Features:**

- Shared TypeScript types and interfaces
- Common utilities and helper functions
- Shared configuration and constants

**Main Commands:**

- `pnpm build` - Builds the package and generates TypeScript definitions
- `pnpm test` - Runs the test suite
- `pnpm test:watch` - Runs tests in watch mode for development
- `pnpm test-debug` - Runs tests in debug mode

**Usage:**
To use this package in other packages within the monorepo, add it as a dependency in your package.json:

```json
{
  "dependencies": {
    "tbpro-shared": "workspace:*"
  }
}
```
