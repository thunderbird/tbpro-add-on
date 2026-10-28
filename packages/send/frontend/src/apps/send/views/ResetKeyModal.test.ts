import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ResetKeyModal from './ResetKeyModal.vue';

// Single-step reset (#1355): the new key, the warning and the confirm button
// share one modal; the checkbox gates the button and saving locks it.

const stubs = {
  DangerButton: {
    props: ['disabled'],
    template:
      '<button data-testid="danger-button" :disabled="disabled"><slot /></button>',
  },
};

// ModalDialog (services-ui) renders its content only after show(), which the
// modal calls on mount, so every test flushes once before querying.
async function mountModal({
  attachTo,
  ...props
}: Record<string, unknown> & { attachTo?: Element } = {}) {
  const wrapper = mount(ResetKeyModal, {
    props: {
      words: ['brave', 'oil', 'hour'],
      regeneratePassphrase: vi.fn(),
      ...props,
    },
    global: { stubs },
    attachTo,
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountModal>>;

const dangerButton = (wrapper: Wrapper) =>
  wrapper.find('[data-testid="danger-button"]');

const regenerateButton = (wrapper: Wrapper) =>
  wrapper.find('button[title="Regenerate"]');

describe('ResetKeyModal.vue', () => {
  it('shows the new key, the warning and both actions', async () => {
    const wrapper = await mountModal();

    expect(wrapper.find('h1').text()).toBe('Reset Encryption Key');
    expect(wrapper.text()).toContain('This is your new encryption key.');
    expect(wrapper.text()).toContain(
      'Your current key stays active until you click Download key and reset.'
    );
    expect(wrapper.text()).toContain('New Encryption Key');
    expect(wrapper.text()).toContain(
      "I understand I'll lose access to my old files."
    );
    expect(
      (
        wrapper.find('[data-testid="reset-key-passphrase"]')
          .element as HTMLInputElement
      ).value
    ).toBe('brave - oil - hour');
    expect(dangerButton(wrapper).text()).toBe('Download key and reset');
  });

  it('keeps Download key and reset disabled until the checkbox is checked', async () => {
    const wrapper = await mountModal();

    expect(dangerButton(wrapper).attributes('disabled')).toBeDefined();
    await dangerButton(wrapper).trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();

    await wrapper.find('[data-testid="understand-checkbox"]').setValue(true);

    expect(dangerButton(wrapper).attributes('disabled')).toBeUndefined();
    await dangerButton(wrapper).trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('locks confirm, cancel and regenerate while saving', async () => {
    const wrapper = await mountModal({ saving: true, canRegenerate: false });
    await wrapper.find('[data-testid="understand-checkbox"]').setValue(true);

    expect(dangerButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.find('.cancel-button').attributes('disabled')).toBeDefined();
    expect(regenerateButton(wrapper).attributes('disabled')).toBeDefined();
    await dangerButton(wrapper).trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('regenerates the key on request', async () => {
    const regeneratePassphrase = vi.fn();
    const wrapper = await mountModal({ regeneratePassphrase });

    await regenerateButton(wrapper).trigger('click');

    expect(regeneratePassphrase).toHaveBeenCalledTimes(1);
  });

  it('emits cancel', async () => {
    const wrapper = await mountModal();

    await wrapper.find('.cancel-button').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('is a labelled dialog that takes focus and closes on Escape', async () => {
    const wrapper = await mountModal({ attachTo: document.body });
    const dialog = wrapper.find('[role="dialog"]');
    const body = wrapper.find('.reset-key-body');

    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe('title');
    expect(wrapper.find('#title').text()).toBe('Reset Encryption Key');
    expect(document.activeElement).toBe(body.element);

    await body.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });

  it('ignores Escape while saving', async () => {
    const wrapper = await mountModal({ saving: true });

    await wrapper.find('.reset-key-body').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('treats the × button as cancel', async () => {
    const wrapper = await mountModal();

    await wrapper.find('.modal-close').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('keeps the dialog open if × is pressed while saving', async () => {
    const wrapper = await mountModal({ saving: true });

    await wrapper.find('.modal-close').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it('shows the error under the key', async () => {
    const wrapper = await mountModal({
      errorMessage: 'Could not reset your encryption key: 422',
    });

    expect(wrapper.find('[data-testid="reset-key-error"]').text()).toBe(
      'Could not reset your encryption key: 422'
    );
  });
});
