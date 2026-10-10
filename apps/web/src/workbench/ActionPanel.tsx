import type { ActionType } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import { ActionParameterForm } from './ActionParameterForm';

const GROUPS: readonly [string, readonly ActionType[]][] = [
  ['ui.actions.group.setup', ['confirm_safety', 'select_apparatus', 'clean_glassware']],
  [
    'ui.actions.group.weighing',
    ['weigh_watch_glass', 'set_balance_sliders', 'add_solid', 'remove_solid'],
  ],
  [
    'ui.actions.group.transfer',
    ['place_funnel', 'transfer_solid', 'rinse_watch_glass', 'rinse_funnel', 'remove_funnel'],
  ],
  [
    'ui.actions.group.solution',
    ['add_water', 'stopper_flask', 'dissolve_solute', 'adjust_to_mark', 'mix_solution'],
  ],
  [
    'ui.actions.group.finish',
    ['apply_label', 'request_hint', 'submit_experiment', 'restart_experiment'],
  ],
];

/**
 * All 21 engine actions as labelled HTML forms. Nothing is disabled because it is scientifically
 * wrong; the engine decides what happens. Only guided beginner marks the suggested next action.
 */
export function ActionPanel() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  if (!session) return null;
  const suggestedAction = session.guidance.suggestedAction;

  return (
    <section className="panel action-panel" aria-labelledby="actions-title">
      <h2 id="actions-title">{t('ui.actions.title')}</h2>
      {GROUPS.map(([titleKey, types]) => (
        <details key={titleKey} className="action-group" open>
          <summary>{t(titleKey)}</summary>
          {types.map((type) => (
            <ActionParameterForm
              key={`${session.sessionId}:${session.attempt}:${type}`}
              type={type}
              suggested={suggestedAction === type}
            />
          ))}
        </details>
      ))}
    </section>
  );
}
