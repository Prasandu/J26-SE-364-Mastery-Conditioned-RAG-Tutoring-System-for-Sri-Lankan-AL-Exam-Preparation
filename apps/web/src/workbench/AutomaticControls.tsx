import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

export const AUTOMATIC_STEP_MS = 1800;

/** Start / Pause / Next step / Restart. Every step is dispatched through the engine as a system action. */
export function AutomaticControls() {
  const { t } = useTranslation();
  const running = useSession((s) => s.automatic.running);
  const setRunning = useSession((s) => s.setAutomaticRunning);
  const advance = useSession((s) => s.advanceAutomaticDemo);
  const dispatch = useSession((s) => s.dispatchLabAction);
  const session = useSession((s) => s.session);
  const next = session?.guidance.nextAction ?? null;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void advance(), AUTOMATIC_STEP_MS);
    return () => clearInterval(timer);
  }, [running, advance]);

  return (
    <div className="automatic-controls" role="group" aria-label={t('ui.automatic.controls')}>
      <p>
        <span className="label">{t('ui.automatic.next')}</span>{' '}
        {next ? t(`exp04.action.${next.type}`) : t('ui.automatic.finished')}
      </p>
      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          onClick={() => setRunning(true)}
          disabled={running || !next}
        >
          {t('ui.automatic.start')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setRunning(false)}
          disabled={!running}
        >
          {t('ui.automatic.pause')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => void advance()}
          disabled={running || !next}
        >
          {t('ui.automatic.next_step')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setRunning(false);
            // Restart is the learner's request, not a canonical demonstration step.
            void dispatch({ type: 'restart_experiment' });
          }}
        >
          {t('ui.automatic.restart')}
        </button>
      </div>
    </div>
  );
}
