import { useTranslation } from 'react-i18next';
import { SourceList } from '../components/SourceList';
import { useSession } from '../store/StoreProvider';
import { AutomaticControls } from './AutomaticControls';

/** Current goal and profile-specific prompt. Prompts come from the definition via the engine. */
export function GuidancePanel() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const session = useSession((s) => s.session);
  const log = useSession((s) => s.log);
  const requestHint = useSession((s) => s.requestHint);
  // Same guard the typed action buttons use: a second dispatch while one is in flight would
  // record a duplicate hint event (and bill the student a second hint) for one intent.
  const busy = useSession((s) => s.ui.busy);
  if (!session) return null;
  const guidance = session.guidance;
  const stage = engine.definition.stages.find((s) => s.id === session.stage);
  const lastHintEvent = [...session.events]
    .reverse()
    .find((e) => e.hintUsed && e.attempt === session.attempt);
  const hintText = lastHintEvent
    ? log.find((l) => l.seq === lastHintEvent.seq && l.kind === 'guidance')?.messageKey
    : undefined;
  const automatic = guidance.profile === 'automatic';

  return (
    <section className="panel guidance-panel" aria-labelledby="guidance-title">
      <h2 id="guidance-title">{t('ui.guidance.title')}</h2>
      <p className="guidance-panel__profile">{t(`ui.profile.${guidance.profile}`)}</p>
      {stage && (
        <p className="guidance-panel__stage">
          <span className="label">{t('ui.guidance.stage')}</span> {t(stage.titleKey)}
        </p>
      )}
      <div className="guidance-panel__prompt" aria-live="polite">
        {guidance.promptKey ? (
          <p>
            <span className="label">
              {t(automatic ? 'ui.guidance.narration' : 'ui.guidance.prompt')}
            </span>{' '}
            {t(guidance.promptKey)}
          </p>
        ) : (
          <p className="hint-text">
            {t(session.status === 'submitted' ? 'ui.guidance.complete' : 'ui.guidance.no_prompt')}
          </p>
        )}
        {automatic && <SourceList refs={guidance.stepSourceRefs} />}
      </div>
      {automatic ? (
        <AutomaticControls />
      ) : (
        <>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void requestHint()}
          >
            {t('ui.guidance.request_hint')}
          </button>
          {hintText && (
            <p className="guidance-panel__hint">
              <span className="label">{t('ui.guidance.hint')}</span> {t(hintText)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
