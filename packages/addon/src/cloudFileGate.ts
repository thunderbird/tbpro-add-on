import type { LoginState } from './menu';

/**
 * What background startup should do with the Thunderbird Send cloudfile
 * provider, given what the login probe managed to find out.
 *
 * - `register`   — the user is signed in; create/register the Send account.
 * - `unregister` — the user is definitely signed out; hide Send entirely.
 * - `leave-as-is` — we could not read storage, so we do not know. Change nothing.
 */
export type CloudFileStartupAction = 'register' | 'unregister' | 'leave-as-is';

/**
 * The Send cloudfile account must only exist once the user has actually signed
 * in. The built-in system add-on is enabled by default for every Thunderbird
 * user, so on a fresh, never-signed-in profile (including under automation) it
 * must not touch the cloudfile account list at all. Otherwise it leaves a
 * "Thunderbird Send" account in the default profile and breaks Thunderbird's own
 * cloudfile tests — browser_ext_cloudFile.js, browser_repeat_upload.js and the
 * addRemoveAccounts checks — which assert a clean account baseline (e.g.
 * "Should have no cloudfile accounts starting off. - 1 == 0"). See Bug 2036665.
 *
 * The manifest `cloud_file` key also makes Thunderbird register the Send
 * provider itself on every startup, independently of the account. On
 * `unregister`, background.ts additionally unregisters that provider (via the
 * CloudFileAccounts experiment API) so a signed-out profile shows no Send entry
 * in the cloud file provider list at all; it is re-registered on sign-in via the
 * SIGN_IN_COMPLETE flow.
 *
 * `leave-as-is` is the third answer, and the reason this function exists rather
 * than a boolean. A failed storage read used to arrive here as `isLoggedIn:
 * false`, indistinguishable from a fresh profile, so a Thunderbird-wide storage
 * failure (Bug 2067502) made the add-on unregister the provider for people who
 * were signed in — they simply lost the ability to send with Send until the
 * storage fault was repaired (Bug 2064203 comment 4). When we cannot tell, the
 * least harmful move is to touch nothing.
 *
 * `leave-as-is` accepts a known, narrow regression against Bug 2036665: the
 * manifest `cloud_file` key has already registered the provider by the time we
 * run, so skipping the unregister leaves a Send entry visible in the provider
 * list on a signed-out or fresh profile whose storage is broken. No cloudfile
 * *account* is created (that is the `register` branch only), so the
 * clean-account-baseline assertions quoted above still hold, and Thunderbird's
 * own test runs use healthy profiles. Losing the ability to send for a whole
 * session is the worse failure, so we take the visible-provider one.
 */
export function cloudFileStartupAction(
  state: LoginState
): CloudFileStartupAction {
  if (state.storageUnavailable) {
    return 'leave-as-is';
  }

  return state.isLoggedIn ? 'register' : 'unregister';
}
