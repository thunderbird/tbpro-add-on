/**
 * Whether to create/register the Thunderbird Send cloudfile account eagerly on
 * background startup.
 *
 * The Send cloudfile account must only exist once the user has actually signed
 * in. The built-in system add-on is enabled by default for every Thunderbird
 * user, so on a fresh, never-signed-in profile (including under automation) it
 * must not touch the cloudfile account list at all. Otherwise it leaves a
 * "Thunderbird Send" account in the default profile and breaks Thunderbird's own
 * cloudfile tests — browser_ext_cloudFile.js, browser_repeat_upload.js and the
 * addRemoveAccounts checks — which assert a clean account baseline (e.g.
 * "Should have no cloudfile accounts starting off. - 1 == 0"). See Bug 2036665.
 *
 * The account is still created on explicit sign-in via the SIGN_IN_COMPLETE
 * flow in background.ts, so signed-in users (standalone or system) keep the Send
 * cloudfile provider configured.
 */
export function shouldInitCloudFileOnStartup(isLoggedIn: boolean): boolean {
  return isLoggedIn;
}
