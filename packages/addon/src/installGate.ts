import { ADDON_ID_SYSTEM } from './addonIds';

/**
 * Whether to auto-open the login tab when the add-on is installed.
 *
 * Only the regular (standalone) add-on does first-run onboarding by opening
 * BASE_URL/login. The built-in system add-on is enabled by default for every
 * Thunderbird user, so it must make zero outbound connections on a fresh,
 * never-signed-in profile: opening the login URL is a network connection that
 * fatally aborts under automation (the non-local-connection guard crashes the
 * process — Bug 2036665). For the system add-on, login stays user-initiated via
 * the menu.
 */
export function shouldAutoOpenLoginOnInstall(
  reason: string,
  runtimeId: string | undefined
): boolean {
  if (reason !== 'install') return false;
  // Unknown id: don't risk a startup network connection.
  if (!runtimeId) return false;
  return runtimeId !== ADDON_ID_SYSTEM;
}
