import type { ActionType } from '@vlab/contracts';
import { useState } from 'react';
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

const COMPACT = '(max-width: 760px)';

/**
 * All 21 engine actions as labelled HTML forms. Nothing is disabled because it is scientifically
 * wrong; the engine decides what happens. Only guided beginner marks the suggested next action.
 */
export function ActionPanel() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  // On phones the groups start collapsed (one tap away) so the laboratory stays scene-first.
  const [compact] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(COMPACT).matches,
  );
  if (!session) return null;
  const suggestedAction = session.guidance.suggestedAction;
  const isManual = session.mode === 'manual';

  return (
    <section className="panel action-panel" aria-labelledby="actions-title">
      <h2 id="actions-title">{t('ui.actions.title')}</h2>
      <p className="action-panel__summary">
        {isManual
          ? t('ui.actions.manual_summary')
          : suggestedAction
            ? t('ui.actions.progressive_summary')
            : t('ui.actions.complete')}
      </p>
      {suggestedAction && !isManual && (
        <div className="action-panel__suggested">
          <p className="label">{t('ui.action.suggested')}</p>
          <ActionParameterForm
            key={`${session.sessionId}:${session.attempt}:suggested:${suggestedAction}`}
            type={suggestedAction}
            suggested
          />
        </div>
      )}
      {GROUPS.map(([titleKey, types]) => (
        <details
          key={titleKey}
          className="action-group"
          open={
            !compact && (isManual || (!suggestedAction && titleKey === 'ui.actions.group.setup'))
          }
        >
          <summary>{t(titleKey)}</summary>
          {types
            .filter((type) => isManual || type !== suggestedAction)
            .map((type) => (
              <ActionParameterForm
                key={`${session.sessionId}:${session.attempt}:${type}`}
                type={type}
                suggested={isManual ? false : suggestedAction === type}
              />
            ))}
        </details>
      ))}
    </section>
  );
}
