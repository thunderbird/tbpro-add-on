import AcceptAccessLink from '@send-frontend/apps/send/views/AcceptAccessLink.vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The password form shows the server's challenge outcome: incorrect (with the
// attempts left), locked (form disabled), or a generic failure.
const { store } = vi.hoisted(() => ({
  store: {
    isAccessLinkValid: vi.fn(),
    acceptAccessLink: vi.fn(),
  },
}));

vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => store,
}));
vi.mock('@send-frontend/lib/validations', () => ({
  getCanRetry: vi.fn(async () => true),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { linkId: 'link-1' } }),
}));

async function submit(password = 'guess') {
  const wrapper = mount(AcceptAccessLink);
  await wrapper.get('[data-testid="password-input"]').setValue(password);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  return wrapper;
}

describe('AcceptAccessLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    store.isAccessLinkValid.mockResolvedValue({ id: 'link-1' });
  });

  it('shows the incorrect-password message with the attempts left', async () => {
    store.acceptAccessLink.mockResolvedValue({
      status: 'incorrect',
      attemptsRemaining: 3,
    });
    const wrapper = await submit();

    expect(wrapper.get('[data-testid="access-link-error"]').text()).toContain(
      'This password is incorrect'
    );
    expect(wrapper.get('[data-testid="attempts-remaining"]').text()).toBe(
      '3 attempts remaining.'
    );
    expect(
      wrapper.get('[data-testid="password-input"]').attributes('disabled')
    ).toBeUndefined();
  });

  it('uses the singular for the last attempt and omits a missing count', async () => {
    store.acceptAccessLink.mockResolvedValueOnce({
      status: 'incorrect',
      attemptsRemaining: 1,
    });
    const wrapper = await submit();
    expect(wrapper.get('[data-testid="attempts-remaining"]').text()).toBe(
      '1 attempt remaining.'
    );

    store.acceptAccessLink.mockResolvedValueOnce({ status: 'incorrect' });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-testid="attempts-remaining"]').exists()).toBe(
      false
    );
  });

  it('shows the locked message and disables the form', async () => {
    store.acceptAccessLink.mockResolvedValue({ status: 'locked' });
    const wrapper = await submit();

    expect(wrapper.get('[data-testid="access-link-error"]').text()).toBe(
      'This link has been locked after too many incorrect attempts.'
    );
    expect(
      wrapper.get('[data-testid="password-input"]').attributes()
    ).toHaveProperty('disabled');
    expect(
      wrapper.get('[data-testid="submit-button"]').attributes()
    ).toHaveProperty('disabled');

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(store.acceptAccessLink).toHaveBeenCalledTimes(1);
  });

  it('keeps the generic message for other failures', async () => {
    store.acceptAccessLink.mockResolvedValue({ status: 'failed' });
    const wrapper = await submit();

    expect(wrapper.get('[data-testid="access-link-error"]').text()).toBe(
      'This password is incorrect'
    );
  });

  it('emits completion on success', async () => {
    store.acceptAccessLink.mockResolvedValue({ status: 'accepted' });
    const wrapper = await submit('right');

    expect(wrapper.emitted('acceptAccessLinkComplete')).toHaveLength(1);
    expect(wrapper.find('[data-testid="access-link-error"]').exists()).toBe(
      false
    );
  });
});
