// German render check for the header, footer, user menu and breadcrumb
// (#1088 batch 3).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { enableAutoUnmount, mount, RouterLinkStub } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: ref({ path: '/send/folder/r1' }) }),
}));
vi.mock('@send-frontend/lib/auth', () => ({
  useAuth: () => ({
    isLoggedIn: ref(true),
    logOutAuth: vi.fn(),
    refetchAuth: vi.fn(),
  }),
}));
vi.mock('@send-frontend/stores', () => ({
  useUserStore: () => ({
    user: { email: 'a@example.test' },
    clearUserFromStorage: vi.fn(),
  }),
  useFolderStore: () => ({ rootFolderId: ref('r1') }),
  useStatusStore: () => ({ validators: vi.fn() }),
}));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({
    rootFolder: { id: 'f1', name: 'Docs', parent: null },
    rootFolderId: 'r1',
  }),
}));
vi.mock('@send-frontend/composables/useIsExtension', () => ({
  useIsExtension: () => ({ isRunningInsideThunderbird: ref(false) }),
}));

import BreadCrumb from './BreadCrumb.vue';
import FooterBar from './FooterBar.vue';
import NavBar from './NavBar.vue';
import UserMenu from './UserMenu.vue';

const global = {
  stubs: {
    RouterLink: RouterLinkStub,
    AppDrawer: true,
    SendLogo: true,
    SettingsIcon: true,
    UserMenu: true,
    StandardFooter: { template: '<div><slot /></div>' },
    UserAvatar: { template: '<span class="avatar" />' },
  },
};

async function toGerman() {
  await setLocale(['de']);
  await nextTick();
}

describe('navigation strings', () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => resetL10n());

  it('NavBar labels follow the locale; test ids stay English', async () => {
    const wrapper = mount(NavBar, { global });
    const files = wrapper.find('[data-testid="navlink-manage-files"]');
    expect(files.text()).toBe('Manage Files');
    await toGerman();
    expect(files.text()).toBe('Dateien verwalten');
    expect(
      wrapper.find('[data-testid="navlink-settings"]').attributes('aria-label')
    ).toBe('Einstellungen');
  });

  it('FooterBar', async () => {
    const wrapper = mount(FooterBar, { global });
    expect(wrapper.text()).toContain('Need help? Visit Support');
    await toGerman();
    expect(wrapper.text()).toContain('Brauchen Sie Hilfe? Zum Support');
  });

  it('UserMenu', async () => {
    const wrapper = mount(UserMenu, { props: { username: 'a' }, global });
    await wrapper.find('.avatar').trigger('click');
    expect(wrapper.text()).toContain('Manage subscription');
    await toGerman();
    expect(wrapper.text()).toContain('Abonnement verwalten');
  });

  it('BreadCrumb', async () => {
    const wrapper = mount(BreadCrumb, { global });
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.attributes('aria-label')).toBe('Go to Docs folder');
    await toGerman();
    expect(link.attributes('aria-label')).toBe('Zum Ordner Docs');
  });
});
