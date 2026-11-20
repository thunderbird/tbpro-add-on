import { FILE_LIST, POPUP_READY } from '@send-frontend/lib/const';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import PopupView from './PopupView.vue';

const { queries } = vi.hoisted(() => ({
  queries: [] as { queryKey: string[]; queryFn: () => Promise<unknown> }[],
}));

vi.mock('@tanstack/vue-query', () => ({
  useQuery: (options: (typeof queries)[number]) => {
    queries.push(options);
    return {
      data: ref(true),
      error: ref(null),
      isLoading: ref(false),
      refetch: vi.fn(),
    };
  },
}));
vi.mock('@send-frontend/lib/auth', () => ({
  useAuth: () => ({
    isLoggedIn: ref(true),
    isLoadingAuth: ref(false),
    refetchAuth: vi.fn(),
  }),
}));
vi.mock('@send-frontend/apps/send/stores/status-store', () => ({
  useStatusStore: () => ({
    progress: {},
    validators: vi.fn().mockResolvedValue({
      hasBackedUpKeys: true,
      isTokenValid: true,
      hasForcedLogin: false,
    }),
  }),
}));
vi.mock('@send-frontend/apps/send/composables/useUploadAndShare', () => ({
  useUploadAndShare: () => ({ isError: ref(false), uploadAndShare: vi.fn() }),
}));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({}),
}));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: { locked: false } }),
}));
vi.mock('@send-frontend/stores/user-store', () => ({ default: () => ({}) }));
vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));
vi.mock('@send-frontend/lib/init', () => ({ default: vi.fn() }));
vi.mock('@send-frontend/lib/keychain', () => ({
  restoreKeysUsingLocalStorage: vi.fn(),
}));
vi.mock('@send-frontend/lib/login', () => ({ openPopup: vi.fn() }));
vi.mock('@send-frontend/lib/queries', () => ({ canUploadQuery: vi.fn() }));
vi.mock('@send-frontend/apps/send/views/PromptLogin.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('@send-frontend/apps/send/pages/UploadPage.vue', () => ({
  default: {
    name: 'UploadPage',
    props: ['files', 'onUploadAndShare'],
    template: '<div />',
  },
}));

const stubs = {
  WithLoader: { template: '<div><slot /></div>' },
  ProButton: true,
  ErrorUploading: true,
};

// Mirrors background.ts: POPUP_READY is answered with the whole upload queue,
// and the queue is emptied as soon as it has been sent.
function fakeBackground(queue: unknown[]) {
  const listeners: ((message: unknown) => unknown)[] = [];
  let pending = queue;
  return {
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => unknown) => {
        listeners.push(listener);
      }),
    },
    sendMessage: vi.fn(async (message: { type: string }) => {
      if (message.type === POPUP_READY) {
        const files = pending;
        pending = [];
        await Promise.all(listeners.map((l) => l({ type: FILE_LIST, files })));
      }
    }),
  };
}

function configuredQuery() {
  return queries.find((q) => q.queryKey[0] === 'is-configured-for-upload')!;
}

describe('PopupView', () => {
  const attached = {
    id: 1,
    name: 'report.pdf',
    data: new File(['report'], 'report.pdf'),
  };
  let runtime: ReturnType<typeof fakeBackground>;

  beforeEach(() => {
    queries.length = 0;
    runtime = fakeBackground([attached]);
    vi.stubGlobal('browser', { runtime });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the attached files when the configuration query refetches', async () => {
    const wrapper = mount(PopupView, { global: { stubs } });
    const uploadPage = () => wrapper.findComponent({ name: 'UploadPage' });

    // First run, as on mount.
    await configuredQuery().queryFn();
    await flushPromises();
    expect(uploadPage().props('files')).toEqual([attached]);

    // Refetch, as on window focus. The background queue is empty by now.
    await configuredQuery().queryFn();
    await flushPromises();

    expect(uploadPage().props('files')).toEqual([attached]);
    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(
      runtime.sendMessage.mock.calls.filter(([m]) => m.type === POPUP_READY)
    ).toHaveLength(1);
  });
});
