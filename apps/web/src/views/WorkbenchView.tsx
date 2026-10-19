import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { SafetyAlert } from '../components/SafetyAlert';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';
import { LaboratoryViewport } from '../workbench/LaboratoryViewport';
import { buildSceneModel } from '../workbench/sceneModel';
import { SidePanel } from '../workbench/SidePanel';

/**
 * Virtual laboratory: session header and safety first, then the 2D/3D laboratory stage, with the
 * seven-section laboratory notebook (V3-2: Context/Materials/Predictions/Protocol/Results/
 * Reflection/Summary) beside it on the right — the equipment tray is the Materials section, not a
 * separate permanent gallery. On narrow screens the stage comes first, then the notebook.
 */
export function WorkbenchView() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const session = useSession((s) => s.session);
  const ui = useSession((s) => s.ui);
  const feedback = useSession((s) => s.feedback);
  const navigate = useSession((s) => s.navigate);

  if (!session) {
    return (
      <section className="view" aria-labelledby="no-session-title">
        <h1 id="no-session-title" className="visually-hidden">
          {t(engine.definition.titleKey)}
        </h1>
        <ConnectionBanner />
        <StatusMessage
          tone="info"
          title={t('ui.workbench.no_session')}
          action={
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate('mode')}
            >
              {t('ui.nav.to_mode')}
            </button>
          }
        />
      </section>
    );
  }

  const model = buildSceneModel(session, engine.definition, ui);
  const stages = engine.definition.stages;
  const stageIndex = Math.max(
    0,
    stages.findIndex((s) => s.id === session.stage),
  );
  const stage = stages[stageIndex];
  // Feedback arrives already filtered by the projection's disclosure rules.
  const announced = feedback
    .filter((f) => f.severity !== 'safety')
    .map((f) => t(f.messageKey))
    .join(' ');

  return (
    <section className="workbench lab-studio" aria-labelledby="workbench-title">
      <header className="workbench__bar">
        <div className="workbench__heading">
          <p className="page-header__eyebrow">
            {t('ui.card.experiment_number', { number: engine.definition.experimentNumber })} ·{' '}
            {t('ui.workbench.eyebrow')}
          </p>
          <h1 id="workbench-title">{t(engine.definition.titleKey)}</h1>
          <ul className="workbench__meta" aria-label={t('ui.workbench.session_facts')}>
            <li className="chip chip--strong">{t(`ui.mode.${session.mode}.title`)}</li>
            {session.guidanceLevel && (
              <li className="chip">{t(`ui.level.${session.guidanceLevel}.title`)}</li>
            )}
            {session.attempt > 1 && (
              <li className="chip">{t('ui.workbench.attempt', { attempt: session.attempt })}</li>
            )}
            {stage && (
              <li className="chip chip--outline">
                <Icon name="layers" size={14} />{' '}
                {t('ui.protocol.stage_of', { current: stageIndex + 1, total: stages.length })}{' '}
                {t(stage.titleKey)}
              </li>
            )}
          </ul>
        </div>
      </header>
      <ConnectionBanner />
      <div className="workbench__safety">
        <SafetyAlert />
      </div>
      <p className="visually-hidden" aria-live="polite" role="status">
        {announced}
      </p>

      <div className="workbench__grid">
        <div className="workbench__scene">
          <LaboratoryViewport model={model} />
        </div>
        <aside className="workbench__side">
          <SidePanel model={model} />
        </aside>
      </div>
    </section>
  );
}
