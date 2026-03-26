import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector'; // 用于自动检测用户语言

// 导入翻译文件
import enTranslation from './locales/en/en-US.json';
import zhTranslation from './locales/zh/zh-CN.json';
import koTranslation from './locales/ko/ko-Kr.json'; // 如果有更多语言就导入

const resources = {
  en: {
    translation: enTranslation,
  },
  zh: {
    translation: zhTranslation,
  },
  ko: {
    translation: koTranslation,
  },
};

i18n
  // 将 i18next 实例传递给 react-i18next
  .use(initReactI18next)
  // 自动检测用户语言
  // 详见：https://github.com/i18next/i18next-browser-languagedetector
  .use(LanguageDetector)
  // 初始化 i18next
  // 详见：https://www.i18next.com/overview/configuration-options
  .init({
    resources, // 导入的翻译资源
    fallbackLng: 'en', // 当当前语言没有翻译时，使用的备用语言，改为中文
    debug: false, // 生产环境关闭调试信息
    interpolation: {
      escapeValue: false, // React 默认会转义，所以不需要 i18next 再次转义
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'], // 优先从localStorage读取
      // 可选的缓存机制，将检测到的语言存储在 localStorage 中
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng', // localStorage的key名
    },
  });

export default i18n;
