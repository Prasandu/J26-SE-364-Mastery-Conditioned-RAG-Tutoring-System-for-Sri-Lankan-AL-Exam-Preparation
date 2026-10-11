import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { SafetyAlert } from '../components/SafetyAlert';
import { SessionNav } from '../components/SessionNav';
import { StageProgress } from '../components/StageProgress';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';
import { AccessibleEquipmentList } from '../workbench/AccessibleEquipmentList';
import { ActionPanel } from '../workbench/ActionPanel';
import { AssistantPanel } from '../workbench/AssistantPanel';
import { GuidancePanel } from '../workbench/GuidancePanel';
import { LabCanvas } from '../workbench/LabCanvas';
import { MeasurementPanel } from '../workbench/MeasurementPanel';
import { ObservationLog } from '../workbench/ObservationLog';
import { buildSceneModel } from '../workbench/sceneModel';

/**
 * Virtual laboratory workspace: equipment, a prominent 3D bench, guidance and actions, then
 * measurements, observations and the contextual assistant. Every panel stays rendered (no hidden
 * tabs) so keyboard and screen-reader users reach all controls; layout adapts by width.
 */
export function WorkbenchView() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const session = useSession((s) => s.session);
  const ui = useSession((s) => s.ui);
  const feedback = useSession((s) => s.feedback);
  const pickItem = useSession((s) => s.pickItem);
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
  const stage = engine.definition.stages.find((s) => s.id === session.stage);
  // Feedback arrives already filtered by the projection's disclosure rules.
  const announced = feedback
    .filter((f) => f.severity !== 'safety')
    .map((f) => t(f.messageKey))
    .join(' ');

  return (
    <section className="workbench" aria-labelledby="workbench-title">
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
                <Icon name="layers" size={14} /> {t(stage.titleKey)}
              </li>
            )}
          </ul>
        </div>
        <SessionNav current="workbench" />
      </header>
      <ConnectionBanner />
      <StageProgress />
      <SafetyAlert />
      <p className="visually-hidden" aria-live="polite" role="status">
        {announced}
      </p>

      <div className="workbench__grid">
        <aside className="workbench__equipment">
          <AccessibleEquipmentList model={model} />
        </aside>
        <div className="workbench__scene">
          <div className="scene-frame">
            <LabCanvas model={model} onPick={pickItem} />
            <p className="scene-frame__caption">{t('ui.workbench.scene_caption')}</p>
          </div>
        </div>
        <aside className="workbench__controls">
          <GuidancePanel />
          {session.mode !== 'automatic' && <ActionPanel />}
        </aside>
      </div>
      <div className="workbench__bottom">
        <MeasurementPanel />
        <ObservationLog />
        <AssistantPanel />
      </div>
    </section>
  );
}
