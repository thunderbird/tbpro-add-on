import { createI18n } from 'vue-i18n';
import en from '@send-frontend/locales/en.json';

const fallbackLocale = 'en';
// StandardFooter currently uses the catalogue bundled with services-ui. Keep
// these messages as the starting point for Send's follow-up string migration.
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
