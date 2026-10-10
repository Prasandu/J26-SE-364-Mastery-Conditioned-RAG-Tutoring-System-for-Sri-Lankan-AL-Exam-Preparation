import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { SafetyAlert } from '../components/SafetyAlert';
import { SessionNav } from '../components/SessionNav';
import { StageProgress } from '../components/StageProgress';
import { useSession } from '../store/StoreProvider';
import { AccessibleEquipmentList } from '../workbench/AccessibleEquipmentList';
import { ActionPanel } from '../workbench/ActionPanel';
import { AssistantPanel } from '../workbench/AssistantPanel';
import { GuidancePanel } from '../workbench/GuidancePanel';
import { LabCanvas } from '../workbench/LabCanvas';
import { MeasurementPanel } from '../workbench/MeasurementPanel';
import { ObservationLog } from '../workbench/ObservationLog';
import { buildSceneModel } from '../workbench/sceneModel';

/** WorkbenchLayout: header bar, equipment, 3D bench, guidance/actions, measurements and log. */
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
      <section className="view">
        <ConnectionBanner />
        <p>{t('ui.workbench.no_session')}</p>
        <button type="button" className="button button--primary" onClick={() => navigate('mode')}>
          {t('ui.nav.to_mode')}
        </button>
      </section>
    );
  }

  const model = buildSceneModel(session, engine.definition, ui);
  // Feedback arrives already filtered by the projection's disclosure rules.
  const announced = feedback
    .filter((f) => f.severity !== 'safety')
    .map((f) => t(f.messageKey))
    .join(' ');
  const levelLabel = session.guidanceLevel
    ? ` · ${t(`ui.level.${session.guidanceLevel}.title`)}`
    : '';

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <header className="workbench__bar">
        <div>
          <h1 id="workbench-title">{t(engine.definition.titleKey)}</h1>
          <p className="workbench__mode">
            {t(`ui.mode.${session.mode}.title`)}
            {levelLabel}
            {session.attempt > 1 && ` · ${t('ui.workbench.attempt', { attempt: session.attempt })}`}
          </p>
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
        <aside className="workbench__left">
          <AccessibleEquipmentList model={model} />
        </aside>
        <div className="workbench__centre">
          <LabCanvas model={model} onPick={pickItem} />
        </div>
        <aside className="workbench__right">
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
