// Login through the real OIDC provider, against a localhost dev stack.
//
// Its own file on purpose. send.spec.ts is one ordered chain against a single
// account and runs in serial mode, where the first failure skips everything
// behind it. This test shares no state with that chain but does depend on
// auth-stage.tb.pro being up — inside the serial group, one bad afternoon at the
// provider would cost the whole dev suite's signal.

import { PLAYWRIGHT_TAG_DEV_DESKTOP } from "../../const/const";
import { oidc_login } from "../../pages/dev/oidc";
import { test } from "../../utils/dev/fixtures";

test.describe(
  "OIDC flow",
  {
    tag: [PLAYWRIGHT_TAG_DEV_DESKTOP],
  },
  () => {
    // The provider is only reachable with the credentials CI injects, so outside CI
    // this reports as skipped rather than passing without signing in.
    test.skip(
      () => !process.env.IS_CI_AUTOMATION,
      "OIDC login needs the credentials CI injects"
    );

    // `oidc_login` signs in from its own incognito context, so it needs a browser
    // rather than the signed-in tab `sendHome` would set up.
    test("Login using OIDC", async ({ openSendContext }) => {
      await oidc_login(await openSendContext());
    });
  }
);
