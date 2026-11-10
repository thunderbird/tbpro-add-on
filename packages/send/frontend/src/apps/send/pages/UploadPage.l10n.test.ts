// German render check for the upload page (#1088 batch 1): the page opens on
// the password step and follows setLocale(['de']).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

vi.mock('@send-frontend/lib/init', () => ({ default: vi.fn() }));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({}),
}));
vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => ({}),
}));
vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: {} }),
}));
vi.mock('@send-frontend/stores/user-store', () => ({
  default: () => ({ user: {} }),
}));
vi.mock('@send-frontend/stores/metrics', () => ({
  default: () => ({ initializeClientMetrics: vi.fn() }),
}));
vi.mock('@send-frontend/apps/common/mixins/metrics', () => ({
  useMetricsUpdate: vi.fn(),
}));
vi.mock('@send-frontend/stores', () => ({
  useConfigStore: () => ({ isThunderbirdHost: true }),
}));
vi.mock('../stores/status-store', () => ({
  useStatusStore: () => ({ progress: { initialize: vi.fn() } }),
}));

import UploadPage from './UploadPage.vue';

describe('UploadPage in German', () => {
  beforeEach(() => resetL10n());

  it('renders the password step through Fluent', async () => {
    const wrapper = mount(UploadPage);
    expect(wrapper.text()).toContain('Create File Password');
    expect(wrapper.text()).toContain('STEP 1 OF 2');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.text()).toContain('Dateipasswort erstellen');
    expect(wrapper.text()).toContain('SCHRITT 1 VON 2');
  });
});
