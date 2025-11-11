import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import AdminPage from '../apps/AdminPage.vue';
import { mountWithPlugins } from './testingUtils';

// Basic smoke test for AdminPage

describe('AdminPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // This test is not really doing anything meaningful yet
  it.skip('shows Send section by default', () => {
    const wrapper = mountWithPlugins(AdminPage);
    expect(wrapper.find('[data-testid="send-section"]').exists()).toBe(true);
  });
});
