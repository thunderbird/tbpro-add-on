import { createI18n } from 'vue-i18n';
import en from '@send-frontend/locales/en.json';

const fallbackLocale = 'en';
const messages = { en };

export function defaultLocale(language?: string) {
  const browserLanguage =
    language ??
    (typeof navigator === 'undefined' ? fallbackLocale : navigator.language);

  return browserLanguage.toLowerCase().split('-')[0] || fallbackLocale;
}

const instance = createI18n({
  legacy: false,
  globalInjection: true,
  locale: defaultLocale(),
  fallbackLocale,
  messages,
});

export default instance;
export const i18n = instance.global;
export type i18nType = typeof i18n.t;
