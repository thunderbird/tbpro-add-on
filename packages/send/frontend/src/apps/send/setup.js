import '@send-frontend/lib/logger';
import posthogPlugin from '@send-frontend/plugins/posthog';
import { VueQueryPlugin } from '@tanstack/vue-query';
import '@thunderbirdops/services-ui/style.css';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import { getSharedPinia } from '@send-frontend/lib/shared-pinia';
import { createVfm } from 'vue-final-modal';
import 'vue-final-modal/style.css';
import { h } from 'vue';
import './style.css';

// TODO: Configure vue-i18n properly. This is a stub to make @thunderbirdops/services-ui
// components work that use $t() and <i18n-t> in templates. The package has vue-i18n as a
// dependency which requires a global i18n instance registered via app.use(i18n).
const i18nStubMessages = {
  'footer.copywrite':
    'Thunderbird is part of {mzlaLink}, a wholly owned subsidiary of Mozilla Foundation. Portions of this content are ©1998–{currentYear} by individual contributors. Content available under a {creativeCommonsLink}.',
  'footer.mzlaLinkText': 'MZLA Technologies Corporation',
  'footer.creativeCommonsLinkText': 'Creative Commons license',
};

// Stub <i18n-t> component that services-ui uses for interpolated translations
const I18nTStub = {
  name: 'i18n-t',
  props: ['keypath', 'tag'],
  render() {
    const message = i18nStubMessages[this.keypath] || this.keypath;
    const slots = this.$slots;
    const tag = this.tag || 'span';

    // Replace {slotName} placeholders with slot content
    const parts = message.split(/(\{[^}]+\})/g);
    const children = parts.map((part) => {
      const match = part.match(/^\{(.+)\}$/);
      if (match && slots[match[1]]) {
        return slots[match[1]]();
      }
      return part;
    });

    return h(tag, null, children);
  },
};

export function setupApp(app) {
  const pinia = getSharedPinia();
  app.use(VueQueryPlugin);
  app.use(pinia);
  app.use(FloatingVue);
  app.use(posthogPlugin);

  // TODO: Remove this once proper i18n is configured, currently required for the StandardFooter component.
  // Stub $t and i18n-t for services-ui components until proper i18n is configured
  app.config.globalProperties.$t = (key) => i18nStubMessages[key] || key;
  // eslint-disable-next-line vue/component-definition-name-casing
  app.component('i18n-t', I18nTStub);
}
export function mountApp(app, nodeName) {
  const vfm = createVfm();
  app.use(vfm).mount(nodeName);
}
