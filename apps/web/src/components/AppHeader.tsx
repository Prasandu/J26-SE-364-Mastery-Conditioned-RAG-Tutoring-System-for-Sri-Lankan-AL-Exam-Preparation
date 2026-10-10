import { useTranslation } from 'react-i18next';
import { translationMeta } from '../i18n';
import { useSession } from '../store/StoreProvider';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AppHeader() {
  const { t } = useTranslation();
  const locale = useSession((s) => s.locale);
  const navigate = useSession((s) => s.navigate);
  const draft = translationMeta(locale, 'exp04').translationStatus === 'draft';
  return (
    <header className="app-header">
      <a className="skip-link" href="#main">
        {t('ui.nav.skip_to_content')}
      </a>
      <div className="app-header__brand">
        <button
          type="button"
          className="link-button app-header__title"
          onClick={() => navigate('library')}
        >
          {t('app.title')}
        </button>
        <span className="app-header__subtitle">{t('app.subtitle')}</span>
      </div>
      <div className="app-header__tools">
        {draft && (
          <p className="draft-notice" role="note">
            {t('ui.translation.draft_notice')}
          </p>
        )}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
