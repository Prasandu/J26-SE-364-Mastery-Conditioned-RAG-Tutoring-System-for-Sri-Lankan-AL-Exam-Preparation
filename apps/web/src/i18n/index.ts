import { TranslationMetaSchema, type Locale, type TranslationMeta } from '@vlab/contracts';
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from '../../../../content/locales/en/common.json';
import enExp04 from '../../../../content/locales/en/exp04.json';
import enUi from '../../../../content/locales/en/ui.json';
import siCommon from '../../../../content/locales/si/common.json';
import siExp04 from '../../../../content/locales/si/exp04.json';
import siUi from '../../../../content/locales/si/ui.json';

type LocaleFile = { _meta: unknown } & Record<string, unknown>;
export const LOCALE_FILES = {
  en: { ui: enUi, exp04: enExp04, common: enCommon },
  si: { ui: siUi, exp04: siExp04, common: siCommon },
} satisfies Record<Locale, Record<string, LocaleFile>>;
export type LocaleFileName = keyof (typeof LOCALE_FILES)['en'];

const strings = (file: LocaleFile): Record<string, string> =>
  Object.fromEntries(Object.entries(file).filter(([k]) => k !== '_meta')) as Record<string, string>;

export const translationMeta = (locale: Locale, file: LocaleFileName): TranslationMeta =>
  TranslationMetaSchema.parse(LOCALE_FILES[locale][file]._meta);

export const resources = Object.fromEntries(
  (Object.keys(LOCALE_FILES) as Locale[]).map((locale) => [
    locale,
    {
      translation: Object.assign({}, ...Object.values(LOCALE_FILES[locale]).map(strings)) as Record<
        string,
        string
      >,
    },
  ]),
) as Record<Locale, { translation: Record<string, string> }>;

/**
 * Keys are flat dotted strings, so key/namespace separators are disabled. There is deliberately no
 * fallback language: a missing Sinhala key renders as its key, visible to maintainers, and fails tests.
 */
export const createI18n = (lng: Locale = 'en'): I18n => {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
};
