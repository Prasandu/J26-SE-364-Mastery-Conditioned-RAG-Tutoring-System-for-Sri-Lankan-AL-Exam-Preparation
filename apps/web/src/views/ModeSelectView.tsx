import type { GuidanceLevel, Mode } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

const MODES: Mode[] = ['automatic', 'guided', 'manual'];
const LEVELS: GuidanceLevel[] = ['beginner', 'intermediate', 'advanced'];

/** ModeSelector: the chosen mode and level are frozen into the session when it starts. */
export function ModeSelectView() {
  const { t } = useTranslation();
  const selection = useSession((s) => s.selection);
  const selectMode = useSession((s) => s.selectMode);
  const canStart = useSession((s) => s.canStart());
  const createSession = useSession((s) => s.createSession);
  const requestModeChange = useSession((s) => s.requestModeChange);
  const session = useSession((s) => s.session);
  const navigate = useSession((s) => s.navigate);

  const start = () => {
    if (session) requestModeChange(selection.mode, selection.guidanceLevel);
    else void createSession();
  };

  return (
    <section className="view view--mode" aria-labelledby="mode-title">
      <h1 id="mode-title">{t('ui.mode.title')}</h1>
      <fieldset className="mode-options">
        <legend>{t('ui.mode.legend')}</legend>
        {MODES.map((m) => (
          <div
            key={m}
            className={selection.mode === m ? 'mode-option mode-option--selected' : 'mode-option'}
          >
            <input
              type="radio"
              id={`mode-${m}`}
              name="mode"
              checked={selection.mode === m}
              onChange={() =>
                selectMode(m, m === 'guided' ? (selection.guidanceLevel ?? 'beginner') : null)
              }
              aria-describedby={`mode-${m}-desc`}
            />
            <label htmlFor={`mode-${m}`}>{t(`ui.mode.${m}.title`)}</label>
            <p id={`mode-${m}-desc`} className="hint-text">
              {t(`ui.mode.${m}.description`)}
            </p>
            {m === 'guided' && selection.mode === 'guided' && (
              <fieldset className="level-options">
                <legend>{t('ui.mode.level_legend')}</legend>
                {LEVELS.map((l) => (
                  <div className="check" key={l}>
                    <input
                      type="radio"
                      id={`level-${l}`}
                      name="level"
                      checked={selection.guidanceLevel === l}
                      onChange={() => selectMode('guided', l)}
                      aria-describedby={`level-${l}-desc`}
                    />
                    <label htmlFor={`level-${l}`}>{t(`ui.level.${l}.title`)}</label>
                    <span id={`level-${l}-desc`} className="hint-text">
                      {' '}
                      — {t(`ui.level.${l}.description`)}
                    </span>
                  </div>
                ))}
              </fieldset>
            )}
          </div>
        ))}
      </fieldset>
      {selection.mode === 'automatic' && (
        <p className="notice" role="note">
          {t('ui.mode.automatic_prelab_note')}
        </p>
      )}
      {!canStart && (
        <p id="start-blocked" className="status status--pending">
          {t('ui.mode.safety_required')}
        </p>
      )}
      {session && <p className="hint-text">{t('ui.mode.restart_note')}</p>}
      <nav className="view-nav" aria-label={t('ui.nav.steps')}>
        <button type="button" className="button" onClick={() => navigate('prelab')}>
          {t('ui.nav.back_prelab')}
        </button>
        {session && (
          <button type="button" className="button" onClick={() => navigate('workbench')}>
            {t('ui.nav.back_workbench')}
          </button>
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={!canStart}
          aria-describedby={canStart ? undefined : 'start-blocked'}
          onClick={start}
        >
          {t(session ? 'ui.mode.start_new' : 'ui.mode.start')}
        </button>
      </nav>
    </section>
  );
}
