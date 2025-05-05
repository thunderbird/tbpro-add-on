import {
  QueryClient,
  VueQueryPlugin,
  VueQueryPluginOptions,
} from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';

export function mountWithPlugins(component) {
  const queryClient = new QueryClient();
  const vueQueryOptions: VueQueryPluginOptions = { queryClient };
  return mount(component, {
    global: {
      plugins: [[VueQueryPlugin, vueQueryOptions]],
    },
  });
}
