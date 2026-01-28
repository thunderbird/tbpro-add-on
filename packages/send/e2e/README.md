# Thunderbird Send E2E Tests

Guide for running the Thunderbird Send E2E tests. The E2E tests run automatically in CI on PRs/branches, and nightly on production. You can also run the E2E tests yourself against your local dev stack.

## E2E Test Prerequisites

The E2E tests require an existing Thunderbird Pro test account.

## Running the E2E tests against your local dev environment

### Setting up

1. In order for the tests to run locally, you have to set up your `.env` files to match the default. This will overwrite your `.env` files. If you need to back up your keys before that you can run:

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

2. Set your environment variables by running (from the root folder of this repo):

```sh
lerna run setup:local
```

To test using TB Pro auth, add your TB Pro credentials to these vars in the `/e2e/.env` file:

```sh
TBPRO_USERNAME=<tb-pro-username>
TBPRO_PASSWORD=<associated-password>
```

3. Make sure you install playwright's dependencies by running (from the root folder of this repo):

```sh
pnpm --filter=send-suite exec playwright install
```

#### Headed mode

To run the E2E tests on Firefox in headed mode (where you can watch the tests run in the browser), from the root folder of this repo:

```sh
pnpm dev:detach
lerna run test:e2e --scope=send-suite
```

#### UI mode

You can run the test suite on UI Mode. UI Mode lets you explore, run, and debug tests with a time travel experience complete with a watch mode. All test files are displayed in the testing sidebar, allowing you to expand each file and describe block to individually run, view, watch, and debug each test. Run from the root folder of this repo:

```sh
pnpm dev:detach
lerna run test:e2e:ui --scope=send-suite
```

#### CI mode

The tests run automatically in CI against branches/PR in headless mode. To replicate how they run in CI (from the root folder of this repo):

```sh
lerna run test:e2e:ci --scope=send-suite
```

### Clean up

When you're finished running the E2E tests from your machine, be sure to shutdown the TB Pro docker containers. From the root folder of this repo:

```sh
docker compose down
```

## Running the nightly E2E tests in production using BrowserStack

Every night we run TB Send E2E tests against the live prodution environment, using browsers provided in the BrowserStack Automate cloud. If you want to trigger the nightly test run against the current production environment:
1. In the `tbpro-add-on` repo click on `Actions`
2. On the left side, click on `nightly-e2e-tests-desktop`
3. On the right side click the `Run workflow` button
4. Leave the branch as `main`
5. Then click the `Run workflow` button

The E2E tests will then run against the current production environment. If you are developing new E2E tests or making E2E test changes, you can run the nightly E2E tests job against production but use your branch with your updated E2E tests. First ensure your udpated branch with the E2E test changes is pushed to the repo; and then follow the above directions except in step 4 select your branch instead of main.

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
