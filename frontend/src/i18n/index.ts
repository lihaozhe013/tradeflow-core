import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/en-US.json';
import zhTranslation from './locales/zh/zh-CN.json';
import koTranslation from './locales/ko/ko-Kr.json';
import {
  clearLegacyLanguageCache,
  languageTag,
  readLanguageSetting,
  resolveActiveLanguage
} from './languages';

const resources = {
  en: {
    translation: enTranslation
  },
  zh: {
    translation: zhTranslation
  },
  ko: {
    translation: koTranslation
  }
};

// One-time cleanup of the cache written by the removed i18next-browser-languagedetector,
// so stale region-tagged values (e.g. "en-US") can never override the new setting.
clearLegacyLanguageCache();

const activeLanguage = resolveActiveLanguage(readLanguageSetting());
document.documentElement.lang = languageTag(activeLanguage);

i18n.use(initReactI18next).init({
  resources,
  lng: activeLanguage,
  fallbackLng: 'en',
  debug: false,
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
