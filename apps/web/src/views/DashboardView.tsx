import type { Mode } from '@vlab/contracts';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';

const MODES: { mode: Mode; icon: IconName }[] = [
  { mode: 'automatic', icon: 'play' },
  { mode: 'guided', icon: 'compass' },
  { mode: 'manual', icon: 'hand' },
];

/**
 * Student dashboard. Shows only real data: the published catalog, the current in-memory session
 * (if any) and the assistant's actual requirements. No invented progress or statistics.
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
  const offline = engine.kind === 'local';

  const openAssistant = () => {
    navigate('workbench');
    window.setTimeout(() => {
      const panel = document.getElementById('assistant-panel');
      panel?.scrollIntoView?.({ block: 'start' });
      panel?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }, 0);
  };

  return (
    <section className="view view--dashboard" aria-labelledby="dashboard-title">
      <PageHeader
        id="dashboard-title"
        eyebrow={t('ui.dashboard.eyebrow')}
        title={t('ui.dashboard.title')}
        lead={t('ui.dashboard.lead')}
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
            <Icon name="layers" />
          </span>
          <span className="stat__label">{t('ui.dashboard.modes_available')}</span>
          <span className="stat__value">{MODES.length}</span>
        </li>
        <li className="stat">
          <span className="stat__icon">
            <Icon name="globe" />
          </span>
          <span className="stat__label">{t('ui.card.languages')}</span>
          <span className="stat__value stat__value--text">{t('ui.card.languages_value')}</span>
        </li>
      </ul>

      <div className="dashboard-grid">
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
              <dd>
                {t(submitted ? 'ui.dashboard.status_submitted' : 'ui.dashboard.status_active')}
              </dd>
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

        <section className="card" aria-labelledby="assistant-entry-title">
          <h2 id="assistant-entry-title" className="card__title">
            <Icon name="chat" /> {t('ui.dashboard.assistant_title')}
          </h2>
          <p>{t('ui.dashboard.assistant_text')}</p>
          <p className="ai-disclosure">{t('app.aiNotice')}</p>
          {offline ? (
            <p className="hint-text">{t('assistant.offline')}</p>
          ) : session ? (
            <button type="button" className="button" onClick={openAssistant}>
              {t('ui.dashboard.assistant_open')}
            </button>
          ) : (
            <p className="hint-text">{t('ui.dashboard.assistant_needs_session')}</p>
          )}
        </section>
      </div>

      <section aria-labelledby="modes-title" className="section">
        <h2 id="modes-title">{t('ui.dashboard.modes_title')}</h2>
        <p className="lead">{t('ui.dashboard.modes_lead')}</p>
        <ul className="mode-tiles">
          {MODES.map(({ mode, icon }) => (
            <li key={mode} className={`mode-tile mode-tile--${mode}`}>
              <span className="mode-tile__icon">
                <Icon name={icon} size={24} />
              </span>
              <h3>{t(`ui.mode.${mode}.title`)}</h3>
              <p>{t(`ui.mode.${mode}.description`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
