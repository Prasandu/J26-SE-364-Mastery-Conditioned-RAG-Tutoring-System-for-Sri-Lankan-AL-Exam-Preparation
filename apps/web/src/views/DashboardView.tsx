import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExperimentCard } from '../components/ExperimentCard';
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
 *
 * The page leads straight to the one thing a student can actually do next: continue the session
 * they already have, or open the practical itself — which is shown here as the real catalog card,
 * not described in the abstract. Decorative counters ("1 practical available") and a restatement
 * of the four-step learning path used to sit between the hero and that action; both were facts
 * the student could not act on, so they are gone.
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
        actions={
          // Each button on this page needs its own accessible name. "Start a practical" belongs to
          // the header nav (it goes to mode selection) and "Open experiment" to the catalog card
          // below (it opens the practical), so the hero takes the third, distinct action: the
          // catalog itself. Reusing either name here would give one page two identically-named
          // buttons leading to different places.
          <button
            type="button"
            className="button button--primary button--lg"
            onClick={() => navigate('library')}
          >
            {t('ui.dashboard.browse')} <Icon name="arrow" size={18} />
          </button>
        }
      />

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
      ) : null}

      {/* The practicals themselves, from the real catalog — the page's actual purpose. */}
      <section className="dashboard__catalog" aria-labelledby="dashboard-catalog-title">
        <div className="section-heading">
          <h2 id="dashboard-catalog-title">
            <Icon name="book" /> {t('ui.library.title')}
          </h2>
          <p className="hint-text">{t('ui.dashboard.start_text')}</p>
        </div>
        {catalog.status === 'error' ? (
          <StatusMessage
            tone="error"
            title={t('ui.library.error_title')}
            action={
              <button type="button" className="button" onClick={() => void loadCatalog()}>
                {t('ui.connection.retry')}
              </button>
            }
          >
            <p>{t('ui.library.error_text')}</p>
          </StatusMessage>
        ) : catalog.status === 'ready' ? (
          // Same horizontal card treatment as the library, so one practical still fills the row
          // instead of sitting as a narrow column beside a wide empty gap.
          <ul className="library-list" aria-label={t('ui.library.title')}>
            {catalog.items.map((entry) => (
              <li key={entry.experimentId}>
                <ExperimentCard entry={entry} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint-text">{t('ui.library.loading')}</p>
        )}
      </section>
    </section>
  );
}
