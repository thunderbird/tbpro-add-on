// German render check for the sign-in/sign-out pages, the welcome page, the
// popup sign-in prompt and the account overview (#1088 batch 3).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@send-frontend/stores', () => ({
  useConfigStore: () => ({ isExtension: false }),
  useAuthStore: () => ({ getOIDCUser: vi.fn() }),
}));
vi.mock('@send-frontend/composables/useSendConfig', () => ({
  useSendConfig: () => ({ clearSendStorage: vi.fn() }),
}));
vi.mock('@send-frontend/lib/login', () => ({ forceCloseWindow: vi.fn() }));
vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: { markFTUEComplete: { mutate: vi.fn() } },
}));
vi.mock('@send-frontend/lib/auth', () => ({
  useAuth: () => ({ logOutAuth: vi.fn() }),
}));
vi.mock('@send-frontend/stores/user-store', () => ({
  default: () => ({ user: { name: 'A', thundermailEmail: 'a@example.test' } }),
}));
vi.mock('@send-frontend/apps/send/composables/useBackupAndRestore', () => ({
  useBackupAndRestore: () => ({ backupData: 'KEYS_IN_LOCAL_STORAGE' }),
}));
vi.stubGlobal('browser', { runtime: { sendMessage: vi.fn() } });

import UserDashboard from '../../common/UserDashboard.vue';
import DownloadTB from '../../common/DownloadTB.vue';
import PromptLogin from '../views/PromptLogin.vue';
import ClosePage from './ClosePage.vue';
import LockedPage from './LockedPage.vue';
import LogOutPage from './LogOutPage.vue';
import WelcomePage from './WelcomePage.vue';

async function toGerman() {
  await setLocale(['de']);
  await nextTick();
}

describe('shell page strings', () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => resetL10n());

  it('LogOutPage counts down in the locale', async () => {
    const wrapper = mount(LogOutPage);
    const p = wrapper.find('[data-testid="redirecting-p"]');
    expect(p.text()).toBe(
      'You will be redirected to the homepage in 5 seconds…'
    );
    await toGerman();
    expect(p.text()).toBe(
      'Sie werden in 5 Sekunden zur Startseite weitergeleitet…'
    );
  });

  it('ClosePage', async () => {
    const wrapper = mount(ClosePage);
    expect(wrapper.find('h2').text()).toBe('Authentication Complete');
    await toGerman();
    expect(wrapper.find('h2').text()).toBe('Anmeldung abgeschlossen');
  });

  it('LockedPage', async () => {
    const wrapper = mount(LockedPage);
    expect(wrapper.text()).toBe('This folder is locked');
    await toGerman();
    expect(wrapper.text()).toBe('Dieser Ordner ist gesperrt');
  });

  it('PromptLogin', async () => {
    const wrapper = mount(PromptLogin);
    expect(wrapper.find('h1').text()).toBe('Please log in to continue');
    await toGerman();
    expect(wrapper.find('h1').text()).toBe(
      'Bitte melden Sie sich an, um fortzufahren'
    );
  });

  it('WelcomePage', async () => {
    const wrapper = mount(WelcomePage, {
      global: { stubs: { SupportBox: true } },
    });
    expect(wrapper.find('h1').text()).toBe('Welcome to Thundermail!');
    await toGerman();
    expect(wrapper.find('h1').text()).toBe('Willkommen bei Thundermail!');
  });

  it('UserDashboard', async () => {
    const wrapper = mount(UserDashboard, {
      global: {
        stubs: {
          StorageBar: true,
          AccessLocked: true,
          BackupKeys: true,
          ManageFiles: true,
          SecurityAndPrivacyV2: true,
          ManageEncryptionKeys: true,
          SupportBox: true,
          RenderOnEnvironment: true,
        },
      },
    });
    expect(wrapper.find('.welcome').text()).toBe('Welcome,');
    await toGerman();
    expect(wrapper.find('.welcome').text()).toBe('Willkommen,');
  });

  it('DownloadTB', async () => {
    const wrapper = mount(DownloadTB);
    expect(wrapper.find('img').attributes('alt')).toBe(
      'Thunderbird desktop app'
    );
    await toGerman();
    expect(wrapper.find('img').attributes('alt')).toBe(
      'Thunderbird-Desktop-App'
    );
  });
});
