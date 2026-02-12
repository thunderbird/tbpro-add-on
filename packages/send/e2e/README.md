# Thunderbird Send E2E Tests

Guide for running the Thunderbird Send E2E tests. The E2E tests run automatically in CI on PRs/branches, and nightly on production. You can also run the E2E tests yourself against your local dev stack.

Currently there are two sets of E2E tests:
- One set of tests that run against a local dev stack. You can run these tests on your machine against your local dev stack, and they also run in CI against PRs/branches (on a dev stack running on a Github Actions worker). These dev E2E tests are found in `/e2e/tests/desktop/dev/send.spec.ts`.
- A separate new set of tests that can run aganist production (in the nightly E2E tests GHA job that runs on BrowserStack). These test are found in `packages/send/e2e/tests/desktop/*.spec.ts`.

Eventually in the future we will just have one set of E2E tests that will run on all environments, but for now we have these two sets of tests until we build out the new set of tests further.

## Running the E2E tests against your local dev environment

When the E2E tests run on your local stack (or in CI on a GHA worker local stack) they use local password auth - the tests create a new TB Send user each time they run.

### Setting up

1. Have your local stack dependencies installed, i.e. from this repo's root folder:

```sh
pnpm install
```

2. In order for the tests to run locally, you have to set up your `.env` files to match the default. This will overwrite your `.env` files. If you need to back up your keys before that you can run:

```sh
cd packages/send
cd frontend
cp .env .env.backup
cd ../backend
cp .env .env.backup
cd ../e2e
cp .env .env.backup
```

The E2E tests run regardless of which storage method your test environment is using (local storage, Backblaze cloud storage, etc). The storage method is configured in the /backend/.env file.

3. Set your environment variables as follows.

The E2E tests require that your local stack use local password auth. To do that, run this (from the root folder):

```sh
lerna run setup:local --scope=send-suite
```

#### Headed mode

To run the E2E tests on Firefox in headed mode (where you can watch the tests run in the browser), from the root folder of this repo:

```sh
docker compose down
lerna run setup:local --scope=send-suite
pnpm dev:detach
lerna run test:e2e --scope=send-suite-e2e
```

#### UI mode

You can run the test suite in UI Mode. UI Mode lets you explore, run, and debug tests with a time travel experience complete with a watch mode. All test files are displayed in the testing sidebar, allowing you to expand each file and describe block to individually run, view, watch, and debug each test. Run from the root folder of this repo:

```sh
docker compose down
lerna run setup:local --scope=send-suite
pnpm dev:detach
lerna run test:e2e:ui --scope=send-suite-e2e
```

#### Headless mode

The tests run automatically in CI against branches/PR in headless mode. To run in headless mode:
```sh
docker compose down
lerna run setup:local --scope=send-suite
pnpm dev:detach
lerna run test:e2e:headless --scope=send-suite-e2e
```

### Clean up

When you're finished running the E2E tests from your machine, be sure to shutdown the TB Pro docker containers. From the root folder of this repo:

```sh
docker compose down
```

## Nightly E2E Tests

There is a nightly E2E tests job that runs each night against TB Send production, in BrowserStack via Github Actions. This nightly test suite is a different set of E2E tests than the E2E tests that are run against a dev stack (above). The nightly E2E test suite runs in BrowserStack so that we can run against a variety of browsers.

The same nightly E2E tests suite can also be run on your local machine's browser but against the TB Send production environment. This is useful if you are developing more E2E tests to run in the nightly E2E test suite on prod and want to debug them.

### Nightly E2E Tests Prerequistes

When the nightly E2E tests run they run against the TB Send production environment and therefore you need an existing TB Acocunts / TB Send test account already setup that the tests will use for sign-in.

**Also the nigthly tests assume that the production test account already has TB Send setup (i.e. already signed in at least once before and encryption keys are already setup). When you sign into TB Send you should see the Profile screen with your Send Storage displayed (and no active prompt to create or restore the encrytion keys).**

### Running the nightly prod E2E tests on Firefox on your local machine

To run the nightly E2E test suite against prod but on Firefox on your local machine:

1. Copy over the example production .env file (from the root folder of the repo):

```sh
cp packages/send/e2e/.env.prod.sample packages/send/e2e/.env
```

2. Then edit the `/e2e/.env` file and add your credentials for your production TB Pro test account:

```sh
TBPRO_USERNAME=<tb-pro-username>
TBPRO_PASSWORD=<associated-password>
```

3. Then from the root folder run:

```sh
lerna run test:e2e:nightly --scope=send-suite-e2e
```

### Running nightly E2E tests in BrowserStack

The nightly E2E tests run automatically each night in BrowserStack via Github Actions. You can trigger the nightly E2E tests job anytime via Github Actions, or you can run the nigthly test suite in BrowserStack from your local machine.

#### Running the nightly E2E tests on production via Github Actions

If you want to trigger the nightly BrowserStack E2E test suite against the current production environment:

1. In the `tbpro-add-on` repo click on `Actions`
2. On the left side, click on `nightly-e2e-tests-desktop`
3. On the right side click the `Run workflow` button
4. Leave the branch as `main`
5. Then click the `Run workflow` button

The E2E tests will then run against the current production environment; they will sign in using the TB Pro test account credentials provided via the corresponding GHA secrets.

If you are developing new E2E tests or making E2E test changes, you can run the nightly E2E tests job against production but use your branch with your updated E2E tests. First ensure your udpated branch with the E2E test changes is pushed to the repo; and then follow the above directions except in step 4 select your branch instead of main.

#### Running the nightly E2E test job in production on BrowserStack from your local machine

If you want to debug the E2E tests that run on production on BrowserStack, you can also run the tests on BrowserStack but from your local machine. First you need to set the vars in the `/e2e/.env` file to be used with production.

<b>For security reasons when running the tests on BrowserStack I recommend that you use a dedicated test Appointment account / credentials (NOT your own personal Appointment credentials).</b>

Once you have credentials for an existing TB Pro test account:

1. Copy over the example production .env file (from the root folder of the repo):

```sh
cp packages/send/e2e/.env.prod.sample packages/send/e2e/.env
```

2. Then edit the `/e2e/.env` file and add your credentials for your production TB Pro test account:

```sh
TBPRO_USERNAME=<tb-pro-username>
TBPRO_PASSWORD=<associated-password>
```

3. Also in order to run on BrowserStack you need to provide your BrowserStack credentials. Sign into your BrowserStack account and navigate to your `User Profile` and find your auth username and access key. In your local terminal export the following env vars to set the BrowserStack credentials that the tests will use:

```bash
export BROWSERSTACK_USERNAME=<your-browserstack-user-name>
```

```bash
export BROWSERSTACK_ACCESS_KEY=<your-browserstack-access-key>
```

4. Then to run on prod in BrowserStack Firefox Desktop but from your machine, from the root folder of this repo:

```sh
lerna run test:e2e:nightly:prod:browserstack:desktop:firefox
```
 
To run on Chromium Desktop:

```sh
lerna run test:e2e:nightly:prod:browserstack:desktop:chromium
```

To run on Safari Desktop:

```sh
lerna run test:e2e:nightly:prod:browserstack:desktop:safari
```

## Debugging E2E Test Failures

Here is some advice for how to investigate E2E test failures.

### E2E Tests Failing on your Local Dev Environment
If you are running the E2E tests on your local machine against your local development environment and the tests are failing, you can:
- Run the tests again this time in debug (UI) mode (see above)
    - In the debug mode browser expand each test that was ran, and review each test step to trace the test progress and failure
    - Look at the corresponding screenshots to get a visual of where and when the tests actually failed
    - Try to correlate the test failure with any local code changes

### E2E Tests Failing in CI on your PR Check
If you pushed to a branch or PR and the resulting Github pull request E2E test job check is failing, you can:

- In your PR scroll down to the 'Checks' section and click on the failed E2E test job
- In the console view, expand the E2E tests step and read the test failure details
- Check if a playwright report artifact exists:
    - In the console view click on `Summary` (top left)
    - This shows the GHA summary, at the bottom of the page look for an `Artifacts` section and click on `playwright-report` and download the ZIP
    - Open the ZIP file, expand it, and open the `index.html` file in your browser

### Nightly E2E Tests CI Job Failing
If you notice an email from Github actions indicating that the Nightly E2E Tests job failed, you can:

- Open the failing Github nightly-tests action job:
    - Click on the `View workflow run` link in the email - or -
    - Go into the Github repo, and
        - Choose `Actions` at the top
        - On the list of Actions on the left side choose `nightly-e2e-tests-desktop`
        - In the corresponding list of completed nightly test action jobs, click on the failing one
    - Then click on the failed E2E test step to open the console view
    - In the console view, expand the E2E tests job and read the test failure details
    - The nightly tests run in BrowserStack which records a video playback of all of the tests
        - In the console view search the logs for the string `View build on BrowserStack dashboard` and retrieve the associated BrowserStack session link
        - Click on the link and sign into BrowserStack with your credentials and view the video replay of the failing test
