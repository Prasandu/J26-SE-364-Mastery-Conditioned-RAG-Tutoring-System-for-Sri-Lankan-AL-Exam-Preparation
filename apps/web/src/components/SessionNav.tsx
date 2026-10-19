import { useTranslation } from 'react-i18next';
import { FLOW_VIEWS, type FlowView, type View } from '../store/sessionStore';
import { useSession } from '../store/StoreProvider';

/** Shared with FlowPager, so step names in the rail and in "Next: …" always read the same. */
export const STEP_LABEL: Record<FlowView, string> = {
  prelab: 'ui.nav.prelab',
  workbench: 'ui.nav.workbench',
  notebook: 'ui.nav.notebook',
  reflection: 'ui.nav.reflection',
  report: 'ui.nav.report',
};

/**
 * The practical as one numbered flow: pre-lab, the lab itself (protocol), the notebook, post-lab
 * reflection and the report, plus a separate "change mode" action. A real nav of clickable steps
 * (not a display-only stepper): the marker carries the step number or a checkmark, the visible
 * label stays exactly the step name so its accessible name never changes between states.
 */
export function SessionNav({ current }: { current: View }) {
  const { t } = useTranslation();
  const navigate = useSession((s) => s.navigate);
  const session = useSession((s) => s.session);
  const submitted = useSession((s) => s.session?.status === 'submitted');
  const index = (FLOW_VIEWS as readonly View[]).indexOf(current);

  return (
    <nav className="session-nav" aria-label={t('ui.nav.session')}>
      <ol className="session-nav__steps">
        {FLOW_VIEWS.map((view, i) => {
          const state = i < index ? 'done' : i === index ? 'current' : 'todo';
          const disabled = (view !== 'prelab' && !session) || (view === 'report' && !submitted);
          return (
            <li key={view} className={`session-nav__item session-nav__item--${state}`}>
              <button
                type="button"
                className="session-nav__button"
                disabled={disabled}
                aria-current={state === 'current' ? 'page' : undefined}
                aria-describedby={
                  view === 'report' && disabled ? 'session-nav-report-locked' : undefined
                }
                onClick={() => navigate(view)}
              >
                <span className="session-nav__marker" aria-hidden="true">
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span className="session-nav__label">{t(STEP_LABEL[view])}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" className="session-nav__mode button" onClick={() => navigate('mode')}>
        {t('ui.workbench.change_mode')}
      </button>
      {!submitted && (
        <span id="session-nav-report-locked" className="visually-hidden">
          {t('ui.report.locked')}
        </span>
      )}
    </nav>
  );
}
