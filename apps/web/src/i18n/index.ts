import { TranslationMetaSchema, type Locale, type TranslationMeta } from '@vlab/contracts';
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import enAdmin from '../../../../content/locales/en/admin.json';
import enCommon from '../../../../content/locales/en/common.json';
import enExp04 from '../../../../content/locales/en/exp04.json';
import enHandbook from '../../../../content/locales/en/handbook.json';
import enLabs from '../../../../content/locales/en/labs.json';
import enTeaching from '../../../../content/locales/en/teaching.json';
import enUi from '../../../../content/locales/en/ui.json';
import siAdmin from '../../../../content/locales/si/admin.json';
import siCommon from '../../../../content/locales/si/common.json';
import siExp04 from '../../../../content/locales/si/exp04.json';
import siHandbook from '../../../../content/locales/si/handbook.json';
import siLabs from '../../../../content/locales/si/labs.json';
import siTeaching from '../../../../content/locales/si/teaching.json';
import siUi from '../../../../content/locales/si/ui.json';

// App keeps its i18next instance across React refreshes. Reload after locale edits so
// an existing development tab cannot retain old resources and display new keys verbatim.
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}

type LocaleFile = { _meta: unknown } & Record<string, unknown>;
export const LOCALE_FILES = {
  en: {
    ui: enUi,
    exp04: enExp04,
    common: enCommon,
    admin: enAdmin,
    handbook: enHandbook,
    labs: enLabs,
    teaching: enTeaching,
  },
  si: {
    ui: siUi,
    exp04: siExp04,
    common: siCommon,
    admin: siAdmin,
    handbook: siHandbook,
    labs: siLabs,
    teaching: siTeaching,
  },
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
