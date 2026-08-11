import { createApp } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { setupApp } from './setup';

vi.mock('@send-frontend/lib/logger', () => ({}));
vi.mock('@send-frontend/lib/shared-pinia', () => ({
  getSharedPinia: vi.fn(() => ({ install: vi.fn() })),
}));
vi.mock('@send-frontend/plugins/posthog', () => ({
  default: { install: vi.fn() },
  setPosthogConsent: vi.fn(),
}));
vi.mock('@tanstack/vue-query', () => ({
  VueQueryPlugin: { install: vi.fn() },
}));
vi.mock('floating-vue', () => ({ default: { install: vi.fn() } }));

describe('setupApp', () => {
  it('registers translation helpers and components', () => {
    const app = createApp({ render: () => null });

    setupApp(app);

    expect(app.config.globalProperties.$t('footer.mzlaLinkText')).toBe(
      'MZLA Technologies Corporation'
    );
    expect(app.component('i18n-t')).toBeDefined();
  });
});
