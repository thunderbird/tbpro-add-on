import {
  QueryClient,
  VueQueryPlugin,
  VueQueryPluginOptions,
} from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import AdminPage from '../apps/AdminPage.vue';

export function mountWithPlugins() {
  const queryClient = new QueryClient();
  const vueQueryOptions: VueQueryPluginOptions = { queryClient };
  return mount(AdminPage, {
    global: {
      plugins: [[VueQueryPlugin, vueQueryOptions]],
    },
  });
}
