import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PassphraseChanged from './PassphraseChanged.vue';

/**
 * PassphraseChanged.vue is shown when the user's encryption keys are
 * "incorrect" / the keychain is locked (typically because the passphrase was
 * reset on another device).
 *
 * It is reached in three ways (see router.ts + useBackupAndRestore.ts):
 *   1. Router guard: navigating to a `requiresBackedUpKeys` route (e.g. /verify)
 *      while `keychain.locked === true` redirects to /passphrase-changed.
 *   2. useBackupAndRestore onMounted: pushes /passphrase-changed when the
 *      keychain is locked at mount time.
 *   3. Direct navigation to /passphrase-changed (route has no guards of its own).
 *
 * The page is intentionally dumb: a single button clears the stale local key
 * material (lb/keys + lb/passphrase) and routes to /send/security-and-privacy.
 * With the keys gone, that page resolves to SHOULD_RESTORE_FROM_BACKUP and
 * renders RestoreKeys, which prompts for the new passphrase and re-fetches keys
 * from the server backup — so this page does NOT ask for or store a passphrase.
 *
 * The Storage class is mocked here so these tests don't depend on a real
 * localStorage (unavailable in this Node env); the storage behavior itself is
 * covered by src/test/lib/storage.clearWrappedKeys.test.ts.
 */

const clearKeys = vi.fn().mockResolvedValue(undefined);

vi.mock('@send-frontend/lib/storage', () => ({
  Storage: class {
    clearKeys = clearKeys;
  },
}));

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

// In-memory keychain state: the page must clear `locked` after removing the
// stale keys, otherwise useBackupAndRestore's onMounted guard bounces the
// user straight back to /passphrase-changed and the button is a loop.
const keychain = { locked: true };

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain }),
}));

const stubs = {
  // SupportBox pulls in external constants/links we don't care about here.
  SupportBox: true,
  // services-ui components trip over the duplicated vue runtime in this test
  // env; a stub still forwards attrs + click handlers, which is all we need.
  PrimaryButton: true,
};

const mountPage = () => mount(PassphraseChanged, { global: { stubs } });

describe('PassphraseChanged.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keychain.locked = true;
  });

  it('renders the warning heading with the red styling class', () => {
    const wrapper = mountPage();

    const heading = wrapper.find('h2.section-title');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe('Warning');
    expect(heading.classes()).toContain('text-red-700');
  });

  it('explains that the keys are incorrect and how to recover', () => {
    const wrapper = mountPage();

    const text = wrapper.text();
    expect(text).toContain('Your keys are incorrect');
    // Mentions the common cause so the user isn't alarmed.
    expect(text).toContain('reset your passphrase on a different device');
  });

  it('renders the recovery flow inside a KeysTemplate wrapper with a SupportBox', () => {
    const wrapper = mountPage();

    const keysTemplate = wrapper.findComponent({ name: 'KeysTemplate' });
    expect(keysTemplate.exists()).toBe(true);
    expect(keysTemplate.text()).toContain('Your keys are incorrect');
    expect(wrapper.findComponent({ name: 'SupportBox' }).exists()).toBe(true);
  });

  it('renders a single recovery button and no passphrase input', () => {
    const wrapper = mountPage();

    expect(
      wrapper.find('[data-testid="passphrase-changed-submit"]').exists()
    ).toBe(true);
    // The page must not collect the passphrase itself.
    expect(
      wrapper.find('[data-testid="passphrase-changed-input"]').exists()
    ).toBe(false);
  });

  it('clears the stale keys and routes to the restore flow when the button is clicked', async () => {
    const wrapper = mountPage();

    await wrapper
      .find('[data-testid="passphrase-changed-submit"]')
      .trigger('click');

    expect(clearKeys).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith('/send/security-and-privacy');
    // The in-memory lock must be released along with the stale keys, or the
    // Security & Privacy page's locked-keychain guard bounces right back here.
    expect(keychain.locked).toBe(false);
    // Keys must be cleared before the navigation so the restore page sees a
    // clean slate and resolves to SHOULD_RESTORE_FROM_BACKUP.
    expect(clearKeys.mock.invocationCallOrder[0]).toBeLessThan(
      routerPush.mock.invocationCallOrder[0]
    );
  });
});
