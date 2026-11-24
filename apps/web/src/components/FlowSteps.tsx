import { useTranslation } from 'react-i18next';
import type { View } from '../store/sessionStore';

const STEPS: { view: View; key: string }[] = [
  { view: 'overview', key: 'ui.flow.overview' },
  { view: 'prelab', key: 'ui.flow.prelab' },
  { view: 'mode', key: 'ui.flow.mode' },
  { view: 'workbench', key: 'ui.flow.lab' },
  { view: 'report', key: 'ui.flow.report' },
];

/** Where the learner is in the practical (informational; navigation stays with page buttons). */
export function FlowSteps({ current }: { current: View }) {
  const { t } = useTranslation();
  const index = STEPS.findIndex((s) => s.view === current);
  return (
    <nav className="flow-steps" aria-label={t('ui.flow.label')}>
      <ol>
        {STEPS.map((step, i) => {
          const state = i < index ? 'done' : i === index ? 'current' : 'todo';
          return (
            <li
              key={step.view}
              className={`flow-steps__item flow-steps__item--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="flow-steps__marker" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="flow-steps__label">{t(step.key)}</span>
              <span className="visually-hidden"> ({t(`ui.stage.${state}`)})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
