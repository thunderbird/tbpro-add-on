import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import AdminPage from '../apps/AdminPage.vue';
import { mountWithPlugins } from './testingUtils';

// Basic smoke test for AdminPage

describe('AdminPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders TB Pro and Send headings', () => {
    const wrapper = mountWithPlugins(AdminPage);
    expect(wrapper.text()).toContain('TB Pro');
    expect(wrapper.text()).toContain('Send');
  });
});
