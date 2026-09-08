import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * The page now offers a self-service recovery flow: the user enters their NEW
 * passphrase, we persist it (lb/passphrase), remove the stale wrapped keys
 * (lb/keys), and reload so the app restores from the server backup.
 *
 * The Storage class is mocked here so these tests don't depend on a real
 * localStorage (unavailable in this Node env); the storage behavior itself is
 * covered by src/test/lib/storage.clearWrappedKeys.test.ts.
 */

const storePassPhrase = vi.fn().mockResolvedValue(undefined);
const clearWrappedKeys = vi.fn().mockResolvedValue(undefined);

vi.mock('@send-frontend/lib/storage', () => ({
  Storage: class {
    storePassPhrase = storePassPhrase;
    clearWrappedKeys = clearWrappedKeys;
  },
}));

const stubs = {
  // SupportBox pulls in external constants/links we don't care about here.
  SupportBox: true,
  // services-ui components trip over the duplicated vue runtime in this test
  // env; a stub still forwards attrs + click handlers, which is all we need.
  PrimaryButton: true,
};

const mountPage = () => mount(PassphraseChanged, { global: { stubs } });

const VALID_PASSPHRASE = 'alpha bravo charlie delta echo foxtrot';

describe('PassphraseChanged.vue', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    reloadSpy = vi.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
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
    // The actionable recovery instruction is the whole point of the page.
    expect(text).toContain('Enter your new passphrase');
  });

  it('renders the recovery flow inside a KeysTemplate wrapper with a SupportBox', () => {
    const wrapper = mountPage();

    const keysTemplate = wrapper.findComponent({ name: 'KeysTemplate' });
    expect(keysTemplate.exists()).toBe(true);
    expect(keysTemplate.text()).toContain('Your keys are incorrect');
    expect(wrapper.findComponent({ name: 'SupportBox' }).exists()).toBe(true);
  });

  it('renders a passphrase input and a submit button', () => {
    const wrapper = mountPage();

    expect(
      wrapper.find('[data-testid="passphrase-changed-input"]').exists()
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="passphrase-changed-submit"]').exists()
    ).toBe(true);
  });

  it('stores the new passphrase, clears wrapped keys, then reloads', async () => {
    const wrapper = mountPage();

    await wrapper
      .find('[data-testid="passphrase-changed-input"]')
      .setValue(VALID_PASSPHRASE);
    await wrapper
      .find('[data-testid="passphrase-changed-submit"]')
      .trigger('click');

    expect(storePassPhrase).toHaveBeenCalledWith(VALID_PASSPHRASE);
    expect(clearWrappedKeys).toHaveBeenCalledTimes(1);
    // Order matters: the new passphrase must be written before the stale
    // wrapped keys are removed, and reload comes last.
    expect(storePassPhrase.mock.invocationCallOrder[0]).toBeLessThan(
      clearWrappedKeys.mock.invocationCallOrder[0]
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('normalizes dash-separated passphrases to the space-separated stored form', async () => {
    const wrapper = mountPage();

    await wrapper
      .find('[data-testid="passphrase-changed-input"]')
      .setValue('  alpha-bravo-charlie-delta-echo-foxtrot  ');
    await wrapper
      .find('[data-testid="passphrase-changed-submit"]')
      .trigger('click');

    expect(storePassPhrase).toHaveBeenCalledWith(VALID_PASSPHRASE);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the input is empty or whitespace', async () => {
    const wrapper = mountPage();

    await wrapper
      .find('[data-testid="passphrase-changed-input"]')
      .setValue('   ');
    await wrapper
      .find('[data-testid="passphrase-changed-submit"]')
      .trigger('click');

    expect(storePassPhrase).not.toHaveBeenCalled();
    expect(clearWrappedKeys).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('shows an error and does not touch storage for an invalid passphrase', async () => {
    const wrapper = mountPage();

    await wrapper
      .find('[data-testid="passphrase-changed-input"]')
      .setValue('only three words');
    await wrapper
      .find('[data-testid="passphrase-changed-submit"]')
      .trigger('click');

    expect(storePassPhrase).not.toHaveBeenCalled();
    expect(clearWrappedKeys).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
    const error = wrapper.find('[data-testid="passphrase-changed-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('Expected 6 words');
  });

  it('submits on Enter in the input', async () => {
    const wrapper = mountPage();

    const input = wrapper.find('[data-testid="passphrase-changed-input"]');
    await input.setValue(VALID_PASSPHRASE);
    await input.trigger('keydown.enter');

    expect(storePassPhrase).toHaveBeenCalledWith(VALID_PASSPHRASE);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
