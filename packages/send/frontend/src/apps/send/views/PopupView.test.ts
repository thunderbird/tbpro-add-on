import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import type { UploadReadiness } from '@send-frontend/lib/uploadReadiness';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import PopupView from './PopupView.vue';

/**
 * Bugzilla 2064458 -- with third-party cookies blocked the popup sat on
 * "Finish setting up Send" and pushed the user into a passphrase window that
 * closed itself instantly, over and over, with no error. Two things are pinned
 * here: the readiness check must name blocked cookies *before* it blames a
 * missing key backup, and the setup window must never open itself more than
 * once.
 */

type Readiness = UploadReadiness | undefined;

const { state } = vi.hoisted(() => ({
  state: {
    readiness: null as unknown as Ref<Readiness>,
    // Captured from the useQuery mock so tests can drive the real query
    // function with whatever the validator would have answered.
    readinessQueryFn: null as unknown as () => Promise<UploadReadiness>,
    isLoggedIn: null as unknown as Ref<boolean>,
    refetch: vi.fn(),
    validators: vi.fn(),
    openPopup: vi.fn(),
  },
}));

vi.mock('@tanstack/vue-query', () => {
  state.readiness = ref<Readiness>(undefined);
  return {
    useQuery: (options: {
      queryKey: string[];
      queryFn: () => Promise<UploadReadiness>;
    }) => {
      if (options.queryKey[0] === 'is-configured-for-upload') {
        state.readinessQueryFn = options.queryFn;
        return {
          data: state.readiness,
          refetch: state.refetch,
          isLoading: ref(false),
        };
      }
      // The `can-upload` query -- never the subject of these tests.
      return {
        data: ref(null),
        error: ref(null),
        refetch: vi.fn(),
        isLoading: ref(false),
      };
    },
  };
});

vi.mock('@send-frontend/lib/auth', () => {
  state.isLoggedIn = ref(true);
  return {
    useAuth: () => ({
      isLoggedIn: state.isLoggedIn,
      refetchAuth: vi.fn(),
      isLoadingAuth: ref(false),
      logOutAuth: vi.fn(),
    }),
  };
});

vi.mock('@send-frontend/lib/login', () => ({
  openPopup: (...args: unknown[]) => state.openPopup(...args),
}));

vi.mock('@send-frontend/apps/send/stores/status-store', () => ({
  useStatusStore: () => ({
    validators: state.validators,
    progress: { error: '', setText: vi.fn() },
  }),
}));

vi.mock('@send-frontend/apps/send/composables/useUploadAndShare', () => ({
  useUploadAndShare: () => ({ isError: ref(false), uploadAndShare: vi.fn() }),
}));

vi.mock('@send-frontend/lib/init', () => ({ default: vi.fn() }));
vi.mock('@send-frontend/lib/keychain', () => ({
  restoreKeysUsingLocalStorage: vi.fn(),
}));
vi.mock('@send-frontend/lib/queries', () => ({ canUploadQuery: vi.fn() }));
vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));
vi.mock('@send-frontend/stores/user-store', () => ({ default: () => ({}) }));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: {} }),
}));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({}),
}));

const stubs = {
  // Renders its slot, unlike a `true` stub -- everything under test lives inside it.
  WithLoader: { props: ['isLoading'], template: '<div><slot /></div>' },
  ProButton: { template: '<button><slot /></button>' },
  UploadPage: { template: '<div data-testid="upload-page" />' },
  ErrorUploading: true,
  PromptPopupLogin: true,
};

const mountPopup = () => mount(PopupView, { global: { stubs } });

/** What `validators()` answers on a fully healthy account. */
const healthyValidators = {
  hasBackedUpKeys: true,
  isTokenValid: true,
  hasForcedLogin: false,
  cookieAccess: 'ok' as const,
};

// Components mounted here register watchers on the shared readiness ref, so
// unmount between tests or a previous test's watcher answers the next test's
// changes and the open-once assertions become meaningless.
enableAutoUnmount(afterEach);

beforeEach(() => {
  state.readiness.value = undefined;
  state.isLoggedIn.value = true;
  state.openPopup.mockReset().mockResolvedValue(true);
  state.refetch.mockReset();
  state.validators.mockReset().mockResolvedValue(healthyValidators);
});

/**
 * The precedence itself lives in lib/uploadReadiness.ts and is tested there.
 * What needs the mounted component is the ready path, because it runs
 * `initialize()` -- and it is the one outcome that gates uploading.
 */
describe('PopupView.vue — readiness check (Bugzilla 2064458)', () => {
  it('reports ready when the cookie is fine, the session is live and the keys are backed up', async () => {
    mountPopup();

    await expect(state.readinessQueryFn()).resolves.toEqual({
      status: 'ready',
    });
  });

  it('reports the blocker the validator answer implies, rather than always blaming setup', async () => {
    state.validators.mockResolvedValue({
      ...healthyValidators,
      hasBackedUpKeys: false,
      cookieAccess: 'blocked',
    });
    mountPopup();

    await expect(state.readinessQueryFn()).resolves.toEqual({
      status: 'cookies-blocked',
    });
  });
});

describe('PopupView.vue — what the user is told (Bugzilla 2064458)', () => {
  it('explains the blocked cookie instead of showing the passphrase setup prompt', async () => {
    state.readiness.value = { status: 'cookies-blocked' };
    const wrapper = mountPopup();
    await nextTick();

    expect(wrapper.find('[data-testid="cookies-blocked-body"]').exists()).toBe(
      true
    );
    expect(wrapper.text()).not.toContain('Finish setting up Send');
  });

  it('names the Thunderbird cookie setting, so the message is something the user can act on', async () => {
    state.readiness.value = { status: 'cookies-blocked' };
    const wrapper = mountPopup();
    await nextTick();

    const body = wrapper.find('[data-testid="cookies-blocked-body"]').text();
    expect(body).toBe(CLIENT_MESSAGES.COOKIES_BLOCKED_BODY);
    expect(body).toContain('Privacy & Security');
    expect(body).toContain('Accept cookies from sites');
  });

  it('offers no Continue Setup button when cookies are blocked, because that flow cannot fix it', async () => {
    state.readiness.value = { status: 'cookies-blocked' };
    const wrapper = mountPopup();
    await nextTick();

    expect(wrapper.find('[data-testid="continue-setup"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="recheck-readiness"]').exists()).toBe(
      true
    );
  });

  it('re-runs the readiness check when the user chooses Check again', async () => {
    state.readiness.value = { status: 'cookies-blocked' };
    const wrapper = mountPopup();
    await nextTick();

    await wrapper.find('[data-testid="recheck-readiness"]').trigger('click');

    expect(state.refetch).toHaveBeenCalled();
  });

  it('still shows the passphrase setup prompt and its button when the key backup is genuinely missing', async () => {
    state.readiness.value = { status: 'needs-setup' };
    const wrapper = mountPopup();
    await nextTick();

    expect(wrapper.text()).toContain('Finish setting up Send');
    expect(wrapper.find('[data-testid="continue-setup"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cookies-blocked-body"]').exists()).toBe(
      false
    );
  });

  it('says setup did not finish once the setup window has been closed without completing it', async () => {
    const wrapper = mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();
    expect(
      wrapper.find('[data-testid="setup-did-not-complete"]').exists()
    ).toBe(false);

    // The auto-open already fired; run its close callback.
    const [, onClose] = state.openPopup.mock.calls[0];
    onClose();
    await nextTick();

    expect(
      wrapper.find('[data-testid="setup-did-not-complete"]').exists()
    ).toBe(true);
  });

  it('explains that the check itself failed, and opens no window, when readiness is undetermined', async () => {
    state.readiness.value = { status: 'unknown' };
    const wrapper = mountPopup();
    await nextTick();

    expect(wrapper.find('[data-testid="readiness-unknown"]').text()).toBe(
      CLIENT_MESSAGES.SETUP_CHECK_FAILED
    );
    expect(state.openPopup).not.toHaveBeenCalled();
  });

  it('renders the upload page once everything is ready', async () => {
    state.readiness.value = { status: 'ready' };
    const wrapper = mountPopup();
    await nextTick();

    expect(wrapper.find('[data-testid="upload-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="finish-setup"]').exists()).toBe(false);
  });
});

describe('PopupView.vue — the setup window must not flap (Bugzilla 2064458)', () => {
  it('opens the setup window once when the key backup is genuinely missing', async () => {
    mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    expect(state.openPopup).toHaveBeenCalledTimes(1);
    expect(state.openPopup.mock.calls[0][0]).toContain(
      '/send/security-and-privacy?closeOnComplete=true'
    );
  });

  it('does not reopen the setup window when the check answers needs-setup again', async () => {
    mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    // A refetch that reaches the same conclusion returns a fresh object.
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    expect(state.openPopup).toHaveBeenCalledTimes(1);
  });

  it('does not reopen the setup window when the answer leaves needs-setup and comes back after the window was closed', async () => {
    mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    // Close the window first. Without this the `isSecurityPopupOpen` guard
    // masks everything and the test proves nothing: it is only once the window
    // is gone that the auto-open latch is the thing standing in the way.
    const [, onClose] = state.openPopup.mock.calls[0];
    onClose();
    await nextTick();

    state.readiness.value = { status: 'unknown' };
    await nextTick();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    expect(state.openPopup).toHaveBeenCalledTimes(1);
  });

  it('does not reopen the setup window when a later check answers needs-setup again after the window was closed', async () => {
    mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    const [, onClose] = state.openPopup.mock.calls[0];
    onClose();
    await nextTick();

    // A refetch reaching the same conclusion hands back a fresh object.
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    expect(state.openPopup).toHaveBeenCalledTimes(1);
  });

  it('never opens the setup window when cookies are blocked', async () => {
    mountPopup();
    state.readiness.value = { status: 'cookies-blocked' };
    await nextTick();

    expect(state.openPopup).not.toHaveBeenCalled();
  });

  it('does not open the setup window while the user is signed out', async () => {
    state.isLoggedIn.value = false;
    mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    expect(state.openPopup).not.toHaveBeenCalled();
  });

  it('still lets the user reopen the setup window by hand after it closed without completing setup', async () => {
    const wrapper = mountPopup();
    state.readiness.value = { status: 'needs-setup' };
    await nextTick();

    const [, onClose] = state.openPopup.mock.calls[0];
    onClose();
    await nextTick();

    await wrapper.find('[data-testid="continue-setup"]').trigger('click');

    expect(state.openPopup).toHaveBeenCalledTimes(2);
  });
});
