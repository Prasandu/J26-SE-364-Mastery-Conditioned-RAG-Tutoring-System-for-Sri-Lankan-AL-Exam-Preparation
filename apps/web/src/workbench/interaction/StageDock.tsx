import type { ActionType } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { StageActionForm } from '../ActionParameterForm';
import { ApparatusThumb } from '../lab2d/Lab2DDefs';
import { placementOf, type SceneItem, type SceneModel } from '../sceneModel';
import { BENCH_TARGET, ITEM_ACTIONS } from './gestures';

/**
 * Context controls under the laboratory scene: what can be done with the chosen item, the
 * "pick up and place" flow (with a keyboard list of targets), and the parameter form for an action
 * started from the scene. Action lists are static per apparatus kind, so they never reveal the
 * next correct step; the engine decides every outcome.
 */
export function StageDock({
  model,
  focused,
  held,
  form,
  suggestedAction,
  busy,
  onAction,
  onPickUp,
  onTarget,
  onCancelHeld,
  onClose,
  onCloseForm,
}: {
  model: SceneModel;
  focused: SceneItem | null;
  held: SceneItem | null;
  form: ActionType | null;
  suggestedAction: ActionType | null;
  busy: boolean;
  onAction: (type: ActionType, item: SceneItem) => void;
  onPickUp: (item: SceneItem) => void;
  onTarget: (targetId: string) => void;
  onCancelHeld: () => void;
  onClose: () => void;
  onCloseForm: () => void;
}) {
  const { t } = useTranslation();

  if (form) {
    return (
      <section className="stage-dock stage-dock--form" aria-labelledby="stage-form-title">
        <div className="stage-dock__head">
          <h3 id="stage-form-title" className="stage-dock__title">
            {t(`exp04.action.${form}`)}
          </h3>
          <button type="button" className="button button--ghost" onClick={onCloseForm}>
            {t('ui.stage.cancel')}
          </button>
        </div>
        <StageActionForm type={form} suggested={suggestedAction === form} />
      </section>
    );
  }

  if (held) {
    const targets = model.items.filter(
      (i) => i.id !== held.id && placementOf(i, model) !== 'shelf',
    );
    return (
      <section className="stage-dock stage-dock--held" aria-labelledby="stage-held-title">
        <div className="stage-dock__head">
          <span className="stage-dock__thumb">
            <ApparatusThumb item={held} model={model} />
          </span>
          <div>
            <h3 id="stage-held-title" className="stage-dock__title">
              {t('ui.stage.holding', { name: t(held.nameKey) })}
            </h3>
            <p className="hint-text">{t('ui.stage.holding_help')}</p>
          </div>
          <button type="button" className="button button--ghost" onClick={onCancelHeld}>
            {t('ui.stage.put_back')}
          </button>
        </div>
        <ul className="stage-dock__targets" aria-label={t('ui.stage.targets')}>
          {targets.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                className="target-chip"
                disabled={busy}
                onClick={() => onTarget(target.id)}
              >
                {t('ui.stage.place_on', { name: t(target.nameKey) })}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="target-chip"
              disabled={busy}
              onClick={() => onTarget(BENCH_TARGET)}
            >
              {t('ui.stage.place_on_bench')}
            </button>
          </li>
        </ul>
      </section>
    );
  }

  if (!focused) {
    return (
      <p className="stage-dock stage-dock--empty hint-text" role="note">
        {t('ui.stage.start_hint')}
      </p>
    );
  }

  const onShelf = placementOf(focused, model) === 'shelf';
  const actions: readonly ActionType[] = onShelf
    ? ['select_apparatus']
    : ITEM_ACTIONS[focused.kind];
  return (
    <section className="stage-dock" aria-labelledby="stage-item-title">
      <div className="stage-dock__head">
        <span className="stage-dock__thumb">
          <ApparatusThumb item={focused} model={model} />
        </span>
        <div>
          <h3 id="stage-item-title" className="stage-dock__title">
            {t(focused.nameKey)}
          </h3>
          <p className="hint-text">{t(`ui.lab.placement.${placementOf(focused, model)}`)}</p>
        </div>
        <button
          type="button"
          className="button button--ghost"
          aria-label={t('ui.stage.close_menu')}
          title={t('ui.stage.close_menu')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="stage-dock__actions" role="group" aria-label={t('ui.stage.item_actions')}>
        {!onShelf && (
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => onPickUp(focused)}
          >
            {t('ui.stage.pick_up')}
          </button>
        )}
        {actions.map((type) => (
          <button
            key={type}
            type="button"
            className={
              suggestedAction === type
                ? 'button button--action is-suggested'
                : 'button button--action'
            }
            disabled={busy}
            onClick={() => onAction(type, focused)}
          >
            {type === 'select_apparatus' ? t('ui.stage.take_to_bench') : t(`exp04.action.${type}`)}
            {suggestedAction === type && (
              <span className="tag tag--suggested">{t('ui.action.suggested')}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
