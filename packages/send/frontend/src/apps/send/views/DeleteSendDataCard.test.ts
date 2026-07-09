import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeleteSendDataCard from './DeleteSendDataCard.vue';

// The real DangerButton renders its own markup; a thin stub that forwards the
// click keeps the test focused on this card's validation behavior.
const stubs = {
  DangerButton: {
    template: '<button data-testid="delete-send-data"><slot /></button>',
  },
};

const STORED = 'one two three four five six';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(DeleteSendDataCard, {
    props: { storedPassphrase: STORED, ...props },
    global: { stubs },
  });
}

async function submit(wrapper: ReturnType<typeof mountCard>, value: string) {
  await wrapper
    .find('[data-testid="delete-understand-checkbox"]')
    .setValue(true);
  await wrapper.find('[data-testid="delete-password"]').setValue(value);
  await wrapper.find('[data-testid="delete-send-data"]').trigger('click');
}

describe('DeleteSendDataCard.vue', () => {
  it('refers to the Encryption Key in the label and placeholder', () => {
    const wrapper = mountCard();

    expect(wrapper.text()).toContain('Enter your Encryption Key to confirm');
    expect(
      wrapper.find('[data-testid="delete-password"]').attributes('placeholder')
    ).toBe('Your Encryption Key goes here');
  });

  it('confirms deletion when the entered Encryption Key matches', async () => {
    const wrapper = mountCard();

    await submit(wrapper, STORED);

    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.find('.error-field').exists()).toBe(false);
  });

  it('shows an Encryption Key mismatch error without confirming', async () => {
    const wrapper = mountCard();

    await submit(wrapper, 'aaa bbb ccc ddd eee fff');

    expect(wrapper.emitted('confirm')).toBeUndefined();
    expect(wrapper.find('.error-field').text()).toBe(
      'Encryption Key does not match. Please try again.'
    );
  });

  it('reports an invalid Encryption Key format', async () => {
    const wrapper = mountCard();

    await submit(wrapper, 'too few words');

    expect(wrapper.emitted('confirm')).toBeUndefined();
    expect(wrapper.find('.error-field').text()).toContain('6 words');
  });

  it('surfaces a server error passed by the parent', () => {
    const wrapper = mountCard({ serverError: 'Something went wrong.' });

    expect(wrapper.find('.error-field').text()).toBe('Something went wrong.');
  });
});
