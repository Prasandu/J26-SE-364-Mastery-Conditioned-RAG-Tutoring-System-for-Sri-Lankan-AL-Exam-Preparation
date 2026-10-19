import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { LabIllustration } from '../workbench/lab2d/LabIllustration';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';

/**
 * Student dashboard. Shows only real data: the published catalog and the current in-memory
 * session (if any). No invented progress or statistics, and nothing duplicated from a page a
 * click away (mode descriptions live on mode selection; the assistant is the floating "Need
 * help?" button reachable from every step of the practical, not a separate entry point here).
 */
export function DashboardView() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const catalog = useSession((s) => s.catalog);
  const loadCatalog = useSession((s) => s.loadCatalog);
  const session = useSession((s) => s.session);
  const navigate = useSession((s) => s.navigate);

  useEffect(() => {
    if (catalog.status === 'idle') void loadCatalog();
  }, [catalog.status, loadCatalog]);

  const stage = session && engine.definition.stages.find((s) => s.id === session.stage);
  const submitted = session?.status === 'submitted';

  return (
    <section className="view view--dashboard" aria-labelledby="dashboard-title">
      <PageHeader
        id="dashboard-title"
        eyebrow={t('ui.dashboard.eyebrow')}
        title={t('ui.dashboard.title')}
        lead={t('ui.dashboard.lead')}
        media={<LabIllustration />}
      />

      <ul className="stat-strip" aria-label={t('ui.dashboard.facts')}>
        <li className="stat">
          <span className="stat__icon">
            <Icon name="flask" />
          </span>
          <span className="stat__label">{t('ui.dashboard.practicals_available')}</span>
          <span className="stat__value">
            {catalog.status === 'ready'
              ? catalog.items.length
              : catalog.status === 'error'
                ? '—'
                : t('ui.state.loading_short')}
          </span>
        </li>
        <li className="stat">
          <span className="stat__icon">
            <Icon name="globe" />
          </span>
          <span className="stat__label">{t('ui.card.languages')}</span>
          <span className="stat__value stat__value--text">{t('ui.card.languages_value')}</span>
        </li>
      </ul>

      {session ? (
        <section className="card card--accent" aria-labelledby="continue-title">
          <h2 id="continue-title" className="card__title">
            <Icon name="flask" /> {t('ui.dashboard.continue_title')}
          </h2>
          <p className="card__lead">{t(engine.definition.titleKey)}</p>
          <dl className="facts">
            <dt>{t('ui.report.mode')}</dt>
            <dd>
              {t(`ui.mode.${session.mode}.title`)}
              {session.guidanceLevel ? ` · ${t(`ui.level.${session.guidanceLevel}.title`)}` : ''}
            </dd>
            <dt>{t('ui.guidance.stage')}</dt>
            <dd>{stage ? t(stage.titleKey) : '—'}</dd>
            <dt>{t('ui.dashboard.status')}</dt>
            <dd>{t(submitted ? 'ui.dashboard.status_submitted' : 'ui.dashboard.status_active')}</dd>
          </dl>
          <p className="hint-text">{t('ui.dashboard.session_memory_note')}</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate('workbench')}
            >
              {t('ui.dashboard.continue_action')}
            </button>
            {submitted && (
              <button type="button" className="button" onClick={() => navigate('report')}>
                {t('ui.dashboard.view_report')}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="card card--accent" aria-labelledby="start-title">
          <h2 id="start-title" className="card__title">
            <Icon name="book" /> {t('ui.dashboard.start_title')}
          </h2>
          <p>{t('ui.dashboard.start_text')}</p>
          {catalog.status === 'error' && (
            <StatusMessage tone="error" title={t('ui.library.error_title')}>
              <p>{t('ui.library.error_text')}</p>
            </StatusMessage>
          )}
          <button
            type="button"
            className="button button--primary"
            onClick={() => navigate('library')}
          >
            {t('ui.dashboard.browse')} <Icon name="arrow" size={18} />
          </button>
        </section>
      )}

      <section className="learning-path card" aria-labelledby="learning-path-title">
        <div className="learning-path__intro">
          <span className="learning-path__icon">
            <Icon name="compass" size={24} />
          </span>
          <div>
            <h2 id="learning-path-title">{t('ui.dashboard.learning_path_title')}</h2>
            <p>{t('ui.dashboard.learning_path_text')}</p>
          </div>
        </div>
        <ol className="learning-path__steps">
          <li>
            <strong>01</strong>
            <span>{t('ui.dashboard.learning_step_overview')}</span>
          </li>
          <li>
            <strong>02</strong>
            <span>{t('ui.dashboard.learning_step_prelab')}</span>
          </li>
          <li>
            <strong>03</strong>
            <span>{t('ui.dashboard.learning_step_lab')}</span>
          </li>
          <li>
            <strong>04</strong>
            <span>{t('ui.dashboard.learning_step_reflect')}</span>
          </li>
        </ol>
      </section>
    </section>
  );
}
