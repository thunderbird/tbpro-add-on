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

  it('toggles ManagementPage visibility', async () => {
    const wrapper = mountWithPlugins(AdminPage);
    const button = wrapper.find('button');
    expect(wrapper.text()).not.toContain('Hide Management Page');
    await button.trigger('click');
    expect(wrapper.text()).toContain('Hide Management Page');
    await button.trigger('click');
    expect(wrapper.text()).toContain('Show Management Page');
  });
});
