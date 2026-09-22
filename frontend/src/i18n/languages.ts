import type { i18n as I18n } from 'i18next';

export type LanguageValue = 'zh' | 'en' | 'ko';

export type LanguageSetting = LanguageValue | 'system';

export const LANGUAGE_STORAGE_KEY = 'tradeflow.language';

export const SUPPORTED_LANGUAGES: readonly LanguageValue[] = ['zh', 'en', 'ko'];

const DEFAULT_LANGUAGE: LanguageValue = 'en';

const LANGUAGE_TAGS: Record<LanguageValue, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ko: 'ko-KR'
};

const LANGUAGE_LABEL_KEYS: Record<LanguageValue, string> = {
  zh: 'common.chinese',
  en: 'common.english',
  ko: 'common.korean'
};

const LANGUAGE_FLAGS: Record<LanguageValue, string> = {
  zh: '🇨🇳',
  en: '🇺🇸',
  ko: '🇰🇷'
};

export function isLanguageValue(value: unknown): value is LanguageValue {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as LanguageValue);
}

export function readLanguageSetting(): LanguageSetting {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'system' || isLanguageValue(stored)) {
      return stored;
    }
  } catch {
    // localStorage can throw in privacy-restricted browser contexts; fall back to system.
  }
  return 'system';
}

export function writeLanguageSetting(setting: LanguageSetting): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, setting);
  } catch {
    // Keep the session working without persistence when storage is unavailable.
  }
}

export function clearLegacyLanguageCache(): void {
  try {
    window.localStorage.removeItem('i18nextLng');
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

export function resolveBrowserLanguage(): LanguageValue {
  const candidates =
    typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    const match = SUPPORTED_LANGUAGES.find(
      (language) => normalized === language || normalized.startsWith(`${language}-`)
    );
    if (match) {
      return match;
    }
  }

  return DEFAULT_LANGUAGE;
}

export function resolveActiveLanguage(setting: LanguageSetting): LanguageValue {
  return setting === 'system' ? resolveBrowserLanguage() : setting;
}

export function languageTag(language: LanguageValue): string {
  return LANGUAGE_TAGS[language];
}

export function languageLabelKey(language: LanguageValue): string {
  return LANGUAGE_LABEL_KEYS[language];
}

export function languageFlag(language: LanguageValue): string {
  return LANGUAGE_FLAGS[language];
}

export function applyLanguageSetting(setting: LanguageSetting, i18n: I18n): void {
  writeLanguageSetting(setting);
  const activeLanguage = resolveActiveLanguage(setting);
  document.documentElement.lang = languageTag(activeLanguage);
  void i18n.changeLanguage(activeLanguage);
}
