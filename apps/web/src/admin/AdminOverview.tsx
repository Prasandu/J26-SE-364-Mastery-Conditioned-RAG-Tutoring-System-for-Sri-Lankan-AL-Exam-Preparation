import type { AdminStatus } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../components/ui/Icon';
import type { AdminSection } from './AdminView';

/** Counts come from the server's draft store; nothing is estimated or invented. */
export function AdminOverview({
  status,
  onNavigate,
}: {
  status: AdminStatus;
  onNavigate: (section: AdminSection) => void;
}) {
  const { t } = useTranslation();
  const tiles: { key: string; value: number; icon: IconName }[] = [
    { key: 'admin.count.drafts', value: status.counts.drafts, icon: 'clipboard' },
    { key: 'admin.count.needs_review', value: status.counts.needsReview, icon: 'search' },
    { key: 'admin.count.content_approved', value: status.counts.contentApproved, icon: 'check' },
    {
      key: 'admin.count.validation_failures',
      value: status.counts.validationFailures,
      icon: 'alert',
    },
    { key: 'admin.count.imports', value: status.counts.imports, icon: 'layers' },
  ];
  return (
    <div className="admin-overview">
      <p className="notice">{t('admin.overview.scope')}</p>
      <ul className="stat-strip stat-strip--admin" aria-label={t('admin.counts')}>
        {tiles.map((tile) => (
          <li key={tile.key} className="stat">
            <span className="stat__icon">
              <Icon name={tile.icon} />
            </span>
            <span className="stat__label">{t(tile.key)}</span>
            <span className="stat__value">{tile.value}</span>
          </li>
        ))}
      </ul>
      <section aria-labelledby="admin-ops-title" className="section">
        <h2 id="admin-ops-title">{t('admin.operations')}</h2>
        <div className="dashboard-grid">
          <article className="card card--accent">
            <h3 className="card__title">
              <Icon name="book" /> {t('admin.op.guide_title')}
            </h3>
            <p>{t('admin.op.guide_text')}</p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => onNavigate('import')}
            >
              {t('admin.op.start_import')}
            </button>
          </article>
          <article className="card">
            <h3 className="card__title">
              <Icon name="clipboard" /> {t('admin.op.review_title')}
            </h3>
            <p>{t('admin.op.review_text')}</p>
            <button type="button" className="button" onClick={() => onNavigate('drafts')}>
              {t('admin.op.open_drafts')}
            </button>
          </article>
          <article className="card">
            <h3 className="card__title">
              <Icon name="layers" /> {t('admin.library.title')}
            </h3>
            <p>{t('admin.library.rule')}</p>
            <button type="button" className="button" onClick={() => onNavigate('library')}>
              {t('admin.overview.open_library')}
            </button>
          </article>
        </div>
        <p className="hint-text">{t('admin.op.not_available')}</p>
      </section>
    </div>
  );
}
