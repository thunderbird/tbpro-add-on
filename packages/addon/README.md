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

This outputs an xpi file at `packages/addon`, you should see something like `tbpro-add-on-0.1.22.xpi`.

You can use this xpi file to install the addon in your Thunderbird for testing.
