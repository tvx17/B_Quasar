import { createI18n } from "vue-i18n";
import { createTranslationLoader, type TranslationMessages } from "./loader";

export const i18n = createI18n({
  legacy: false,
  locale: "en-US",
  fallbackLocale: "en-US",
  messages: {}
});

// Vite creates separate chunks; no translation content is loaded at startup.
const files = import.meta.glob<TranslationMessages>("./locales/**/*.json", {
  import: "default"
});

const loader = createTranslationLoader(files, {
  getLocale: () => i18n.global.locale.value,
  setLocale: locale => {
    i18n.global.locale.value = locale;
  },
  mergeMessages: (locale, messages) =>
    i18n.global.mergeLocaleMessage(locale, messages),
  getMessages: locale => i18n.global.getLocaleMessage(locale),
  setMessages: (locale, messages) =>
    i18n.global.setLocaleMessage(locale, messages)
});

export const loadTranslations = loader.loadTranslations;
export const unloadTranslations = loader.unloadTranslations;
export const setLocale = loader.setLocale;
export { TranslationFileNotFoundError } from "./loader";
