import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-ignore - Vue component import
import AdminPage from '../apps/AdminPage.vue';
import { mountWithPlugins } from './testingUtils';

// Basic smoke test for AdminPage

describe('AdminPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders TB Pro heading and Send toggle', () => {
    const wrapper = mountWithPlugins(AdminPage);
    expect(wrapper.get('[data-testid="tbpro-heading"]').text()).toContain(
      'TB Pro Services'
    );
    expect(wrapper.get('[data-testid="label-send"]').text()).toBe('Send');
    expect(wrapper.find('[data-testid="toggle-send"]').exists()).toBe(true);
  });

  it('shows Send section by default', () => {
    const wrapper = mountWithPlugins(AdminPage);
    expect(wrapper.find('[data-testid="send-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="assist-section"]').exists()).toBe(false);
  });

  it('shows Assist section when toggled', async () => {
    const wrapper = mountWithPlugins(AdminPage);
    const assistToggle = wrapper.get('[data-testid="toggle-assist"]');
    await assistToggle.setValue(true);
    expect(wrapper.find('[data-testid="assist-section"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="assist-section"]').text()).toContain(
      'Assist service coming soon'
    );
  });
});
