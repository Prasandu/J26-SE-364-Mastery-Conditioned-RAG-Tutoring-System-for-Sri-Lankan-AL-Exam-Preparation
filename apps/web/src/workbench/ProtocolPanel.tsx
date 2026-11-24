import { useTranslation } from 'react-i18next';
import { StageProgress } from '../components/StageProgress';
import { useSession } from '../store/StoreProvider';

const RECENT = 5;

/**
 * Shared protocol for both renderers: experiment, current stage and progress, the ordered stage
 * list, and the most recent recorded events. Everything comes from the public projection;
 * stage progress is the engine's stage, never a client estimate.
 */
export function ProtocolPanel() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const session = useSession((s) => s.session);
  if (!session) return null;
  const stages = engine.definition.stages;
  const index = Math.max(
    0,
    stages.findIndex((s) => s.id === session.stage),
  );
  const stage = stages[index];
  const recent = session.events.slice(-RECENT).reverse();

  return (
    <section className="panel protocol-panel" aria-labelledby="protocol-title">
      <p className="page-header__eyebrow">{t('ui.protocol.eyebrow')}</p>
      <h2 id="protocol-title">{t(engine.definition.titleKey)}</h2>
      {stage && (
        <p className="protocol-panel__stage">
          {t('ui.protocol.stage_of', { current: index + 1, total: stages.length })}{' '}
          <strong>{t(stage.titleKey)}</strong>
        </p>
      )}
      <div
        className="protocol-panel__progress"
        role="progressbar"
        aria-label={t('ui.protocol.progress')}
        aria-valuemin={0}
        aria-valuemax={stages.length}
        aria-valuenow={index + 1}
      >
        <span style={{ width: `${((index + 1) / stages.length) * 100}%` }} />
      </div>
      <StageProgress vertical />
      <h3 className="protocol-panel__subtitle">{t('ui.protocol.recent')}</h3>
      {recent.length === 0 ? (
        <p className="hint-text">{t('ui.protocol.no_events')}</p>
      ) : (
        <ol className="protocol-panel__events">
          {recent.map((e) => (
            <li key={e.seq} className={e.accepted ? 'event event--ok' : 'event event--rejected'}>
              <span className="event__seq">#{e.seq}</span>
              <span className="event__action">{t(`exp04.action.${e.action.type}`)}</span>
              <span className="event__status">
                {t(e.accepted ? 'ui.protocol.recorded' : 'ui.protocol.not_accepted')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
