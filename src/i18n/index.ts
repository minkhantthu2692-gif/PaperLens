import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { my } from './locales/my';

export const SUPPORTED_LANGUAGES = ['en', 'my'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'paperlens.language';
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const resources = {
  en: { translation: en },
  my: { translation: my },
} as const;

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function readStoredLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function persistLanguage(language: string): void {
  try {
    if (isSupportedLanguage(language)) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  } catch {
    // Storage may be unavailable (private mode, quota). Language still applies for this session.
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

i18n.on('languageChanged', (language) => {
  persistLanguage(language);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

export default i18n;
