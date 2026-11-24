import type { Locale } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

const LOCALES: Locale[] = ['en', 'si'];

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const locale = useSession((s) => s.locale);
  const setLocale = useSession((s) => s.setLocale);
  return (
    <div role="group" aria-label={t('ui.language.label')} className="language-switcher">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          className={locale === l ? 'toggle toggle--on' : 'toggle'}
          onClick={() => setLocale(l)}
        >
          {t(`ui.language.${l}`)}
        </button>
      ))}
    </div>
  );
}
