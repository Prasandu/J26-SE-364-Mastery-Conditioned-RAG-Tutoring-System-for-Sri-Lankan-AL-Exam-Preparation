import type { Action, ActionType } from '@vlab/contracts';
import { placementOf, type SceneItem, type SceneModel } from '../sceneModel';

/**
 * Presentation-layer interaction table. Every gesture resolves to an EXISTING typed engine action
 * (dispatched directly when it needs no learner input, or opened as the normal parameter form).
 * Nothing here checks whether the action is scientifically right: the engine decides, so manual
 * mode keeps its meaningful mistakes and the UI never predicts success.
 */

/** Drop target meaning "the free bench surface". */
export const BENCH_TARGET = 'bench';

export type GestureResult =
  | { kind: 'dispatch'; action: Action }
  | { kind: 'form'; type: ActionType }
  | { kind: 'none'; reasonKey: string };

type Kind = SceneItem['kind'];

/**
 * Actions offered in an item's menu. A static list per apparatus kind: it is the same in every
 * mode and state, so it never hints at the next correct step.
 */
export const ITEM_ACTIONS: Record<Kind, readonly ActionType[]> = {
  volumetric_flask: [
    'clean_glassware',
    'add_water',
    'stopper_flask',
    'dissolve_solute',
    'adjust_to_mark',
    'mix_solution',
    'apply_label',
  ],
  watch_glass: [
    'clean_glassware',
    'weigh_watch_glass',
    'add_solid',
    'remove_solid',
    'transfer_solid',
    'rinse_watch_glass',
  ],
  funnel: ['clean_glassware', 'place_funnel', 'rinse_funnel', 'remove_funnel'],
  balance: ['weigh_watch_glass', 'set_balance_sliders'],
  wash_bottle: ['add_water', 'rinse_watch_glass', 'rinse_funnel'],
  reagent: ['add_solid', 'remove_solid'],
  dropper: ['adjust_to_mark'],
  beaker: ['clean_glassware'],
};

/**
 * Builds the action for a menu choice. Actions whose only input is the item itself (or public
 * state such as the stopper) are dispatched directly; everything else opens the usual form.
 */
export const menuAction = (
  type: ActionType,
  item: SceneItem,
  model: SceneModel,
  pendingApparatus: readonly string[],
): GestureResult => {
  switch (type) {
    case 'select_apparatus':
      return {
        kind: 'dispatch',
        action: {
          type,
          apparatusIds: [...new Set([...pendingApparatus.filter((id) => id !== item.id), item.id])],
        },
      };
    case 'clean_glassware':
      return { kind: 'dispatch', action: { type, apparatusIds: [item.id] } };
    case 'stopper_flask':
      return { kind: 'dispatch', action: { type, inserted: !model.stoppered } };
    case 'weigh_watch_glass':
    case 'place_funnel':
    case 'remove_funnel':
      return { kind: 'dispatch', action: { type } };
    default:
      return { kind: 'form', type };
  }
};

/** Source item moved onto a target item (or the bench). */
export const resolveGesture = (
  source: SceneItem,
  target: SceneItem | typeof BENCH_TARGET,
  model: SceneModel,
): GestureResult => {
  const sourcePlacement = placementOf(source, model);
  // Taking an item from the shelf onto the bench is the existing selection action.
  if (sourcePlacement === 'shelf') {
    if (target === BENCH_TARGET || placementOf(target, model) !== 'shelf')
      return { kind: 'dispatch', action: { type: 'select_apparatus', apparatusIds: [source.id] } };
    return { kind: 'none', reasonKey: 'ui.gesture.no_effect' };
  }
  if (target === BENCH_TARGET) {
    if (source.kind === 'funnel' && sourcePlacement === 'on_flask')
      return { kind: 'dispatch', action: { type: 'remove_funnel' } };
    return { kind: 'none', reasonKey: 'ui.gesture.no_effect' };
  }
  if (target.id === source.id) return { kind: 'none', reasonKey: 'ui.gesture.no_effect' };
  const toWorkingFlask = target.kind === 'volumetric_flask' && target.id === model.workingFlaskId;
  const pair = `${source.kind}>${target.kind}`;
  switch (pair) {
    case 'watch_glass>balance':
      return { kind: 'dispatch', action: { type: 'weigh_watch_glass' } };
    case 'reagent>watch_glass':
      return { kind: 'form', type: 'add_solid' };
    case 'watch_glass>reagent':
      return { kind: 'form', type: 'remove_solid' };
    case 'watch_glass>funnel':
      return { kind: 'form', type: 'transfer_solid' };
    case 'wash_bottle>watch_glass':
      return { kind: 'form', type: 'rinse_watch_glass' };
    case 'wash_bottle>funnel':
      return { kind: 'form', type: 'rinse_funnel' };
    case 'funnel>volumetric_flask':
      return toWorkingFlask
        ? { kind: 'dispatch', action: { type: 'place_funnel' } }
        : { kind: 'none', reasonKey: 'ui.gesture.flask_not_in_use' };
    case 'watch_glass>volumetric_flask':
      return toWorkingFlask
        ? { kind: 'form', type: 'transfer_solid' }
        : { kind: 'none', reasonKey: 'ui.gesture.flask_not_in_use' };
    case 'wash_bottle>volumetric_flask':
      return toWorkingFlask
        ? { kind: 'form', type: 'add_water' }
        : { kind: 'none', reasonKey: 'ui.gesture.flask_not_in_use' };
    case 'dropper>volumetric_flask':
      return toWorkingFlask
        ? { kind: 'form', type: 'adjust_to_mark' }
        : { kind: 'none', reasonKey: 'ui.gesture.flask_not_in_use' };
    default:
      return { kind: 'none', reasonKey: 'ui.gesture.no_effect' };
  }
};
