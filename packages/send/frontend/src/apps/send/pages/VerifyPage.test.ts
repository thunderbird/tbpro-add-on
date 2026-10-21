import { TRPCClientError } from '@trpc/client';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyPage from './VerifyPage.vue';

// VerifyPage reports a new device as verified only after the passphrase
// handoff is stored; a rejected handoff must surface an error instead.

const { state } = vi.hoisted(() => ({
  state: {
    routerBack: vi.fn(),
    share: vi.fn(),
    onFinished: null as null | ((data: { code: string }) => Promise<void>),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: state.routerBack }),
}));

vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: { call: vi.fn() } }),
}));

vi.mock('../stores/verification-store', () => ({
  useVerificationStore: () => ({
    handleSuccessfulVerificationForExistingClient: state.share,
  }),
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    onVerificationFinished: {
      subscribe: (
        _input: unknown,
        opts: { onData: (data: { code: string }) => Promise<void> }
      ) => {
        state.onFinished = opts.onData;
      },
    },
  },
}));

const trpcError = (code: string) =>
  new TRPCClientError(code, {
    result: { error: { message: code, code: -32029, data: { code } } },
  });

const finishVerification = async () => {
  const wrapper = mount(VerifyPage);
  await state.onFinished!({ code: '123456' });
  await flushPromises();
  return wrapper;
};

describe('VerifyPage.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows success and navigates back once the handoff is stored', async () => {
    state.share.mockResolvedValue({ success: true, id: 'abc' });

    const wrapper = await finishVerification();

    expect(wrapper.text()).toContain('New device verified');
    expect(wrapper.find('[data-testid="share-error"]').exists()).toBe(false);
    expect(state.routerBack).toHaveBeenCalledOnce();
  });

  it('asks the user to wait when the server rate-limits the handoff', async () => {
    state.share.mockRejectedValue(trpcError('TOO_MANY_REQUESTS'));

    const wrapper = await finishVerification();

    expect(wrapper.text()).not.toContain('New device verified');
    expect(wrapper.get('[data-testid="share-error"]').text()).toBe(
      'Too many attempts — wait a few minutes and try again.'
    );
    expect(state.routerBack).not.toHaveBeenCalled();
  });

  it('shows a generic failure for any other error', async () => {
    state.share.mockRejectedValue(trpcError('INTERNAL_SERVER_ERROR'));

    const wrapper = await finishVerification();

    expect(wrapper.text()).not.toContain('New device verified');
    expect(wrapper.get('[data-testid="share-error"]').text()).toBe(
      'Could not share your passphrase with the new device. Please try again.'
    );
    expect(state.routerBack).not.toHaveBeenCalled();
  });
});
