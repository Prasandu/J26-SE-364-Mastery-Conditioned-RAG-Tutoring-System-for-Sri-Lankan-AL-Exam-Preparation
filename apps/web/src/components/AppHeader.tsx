import { useTranslation } from 'react-i18next';
import { useAdmin } from '../admin/AdminContext';
import { translationMeta } from '../i18n';
import type { View } from '../store/sessionStore';
import { useSession } from '../store/StoreProvider';
import { Icon } from './ui/Icon';
import { LanguageSwitcher } from './LanguageSwitcher';

const EXPERIMENT_VIEWS: View[] = ['overview', 'prelab', 'mode', 'workbench', 'notebook', 'report'];

export function AppHeader() {
  const { t } = useTranslation();
  const locale = useSession((s) => s.locale);
  const view = useSession((s) => s.view);
  const navigate = useSession((s) => s.navigate);
  const draft = translationMeta(locale, 'exp04').translationStatus === 'draft';
  const { available: adminAvailable } = useAdmin();
  const inExperiment = EXPERIMENT_VIEWS.includes(view);
  const navItem = (target: View, labelKey: string, active: boolean) => (
    <li>
      <button
        type="button"
        className={active ? 'nav-link nav-link--active' : 'nav-link'}
        aria-current={active ? 'page' : undefined}
        onClick={() => navigate(target)}
      >
        {t(labelKey)}
      </button>
    </li>
  );
  return (
    <header className="app-header">
      <a className="skip-link" href="#main">
        {t('ui.nav.skip_to_content')}
      </a>
      <div className="app-header__inner">
        <button
          type="button"
          className="app-header__brand"
          onClick={() => navigate('dashboard')}
          aria-label={t('ui.nav.home_label')}
        >
          <span className="app-header__logo">
            <Icon name="flask" size={22} />
          </span>
          <span className="app-header__brand-text">
            <span className="app-header__title">{t('app.title')}</span>
            <span className="app-header__subtitle">{t('app.subtitle')}</span>
          </span>
        </button>
        <nav className="app-nav" aria-label={t('ui.nav.primary')}>
          <ul>
            {navItem('dashboard', 'ui.nav.dashboard', view === 'dashboard')}
            {navItem('library', 'ui.nav.library', view === 'library' || inExperiment)}
            {adminAvailable && navItem('admin', 'admin.nav', view === 'admin')}
          </ul>
        </nav>
        <div className="app-header__tools">
          {draft && (
            <p className="draft-notice" role="note">
              {t('ui.translation.draft_notice')}
            </p>
          )}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
