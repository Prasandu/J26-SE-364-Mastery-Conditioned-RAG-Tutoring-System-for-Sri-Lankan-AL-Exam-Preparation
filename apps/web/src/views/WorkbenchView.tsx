import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { SafetyAlert } from '../components/SafetyAlert';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';
import { LaboratoryViewport } from '../workbench/LaboratoryViewport';
import { buildSceneModel } from '../workbench/sceneModel';
import { NotebookSheet } from '../workbench/NotebookSheet';

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
  // Feedback arrives already filtered by the projection's disclosure rules.
  const announced = feedback
    .filter((f) => f.severity !== 'safety')
    .map((f) => t(f.messageKey))
    .join(' ');

  return (
    <section className="workbench lab-studio" aria-labelledby="workbench-title">
      {/* The flow-shell top bar already shows the experiment title and step; this stays compact
          and does not repeat it — just the session facts a student needs while working. */}
      <h1 id="workbench-title" className="visually-hidden">
        {t(engine.definition.titleKey)}
      </h1>
      {/* The mode/level/stage chips and the static precaution banner were removed for a cleaner,
          LabXchange-style workbench: the current stage is already shown in the Protocol section,
          and dynamic safety warnings still appear below. Connection errors still surface. */}
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
          {/* A column beside the stage on a wide screen; a dismissible sheet on a phone. */}
          <NotebookSheet model={model} />
        </aside>
      </div>
    </section>
  );
}
