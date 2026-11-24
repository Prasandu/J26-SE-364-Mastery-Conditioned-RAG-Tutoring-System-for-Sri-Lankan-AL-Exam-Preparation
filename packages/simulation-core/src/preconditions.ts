import type { Action, PreconditionId, SimulationState } from '@vlab/contracts';
import type { SimulationContext } from './context';
import { boundNumber } from './context';
import { apparatusById, toCm3, toGrams, transferredMassG } from './lab';
import { EPSILON } from './quantities';

type Check = (s: SimulationState, a: Action, ctx: SimulationContext) => boolean;

const listedIds = (a: Action): string[] =>
  a.type === 'select_apparatus' || a.type === 'clean_glassware' ? a.apparatusIds : [];

const flaskHasMaterial = (s: SimulationState): boolean =>
  transferredMassG(s.lab) > 0 || s.lab.flask.liquidVolume.value > 0;

const addedVolumeCm3 = (a: Action, ctx: SimulationContext): number => {
  if (a.type === 'add_water') return toCm3(a.volume);
  if (a.type === 'rinse_watch_glass' || a.type === 'rinse_funnel')
    return boundNumber(ctx, 'rinseVolume');
  return 0;
};

const isEmptyGlassware = (s: SimulationState, id: string, ctx: SimulationContext): boolean => {
  const { lab } = s;
  const kind = apparatusById(ctx.definition, id)?.kind;
  if (kind === 'watch_glass')
    return lab.watchGlass.solid.value === 0 && lab.watchGlass.residue.value === 0;
  if (kind === 'funnel') return !lab.funnel.onFlask && lab.funnel.residue.value === 0;
  if (kind === 'volumetric_flask') return lab.workingFlaskId !== id || !flaskHasMaterial(s);
  return true;
};

const CHECKS: Record<PreconditionId, Check> = {
  not_submitted: (s) => !s.lab.submitted,
  apparatus_known: (_s, a, ctx) =>
    listedIds(a).every((id) => apparatusById(ctx.definition, id) !== undefined),
  apparatus_selected: (s, a, ctx) => {
    if (a.type === 'clean_glassware')
      return a.apparatusIds.every((id) => s.lab.selectedApparatus.includes(id));
    const rule = ctx.definition.transitionRules.find((r) => r.action === a.type);
    return (rule?.requiresApparatus ?? []).every((kind) =>
      s.lab.selectedApparatus.some((id) => apparatusById(ctx.definition, id)?.kind === kind),
    );
  },
  glassware_cleanable_and_empty: (s, a, ctx) =>
    listedIds(a).every(
      (id) =>
        apparatusById(ctx.definition, id)?.requiresCleaning === true &&
        isEmptyGlassware(s, id, ctx),
    ),
  flask_selected: (s) => s.lab.workingFlaskId !== null,
  flask_switch_allowed: (s, a, ctx) => {
    const flasks = listedIds(a).filter(
      (id) => apparatusById(ctx.definition, id)?.kind === 'volumetric_flask',
    );
    if (flasks.length > 1) return false;
    const [next] = flasks;
    if (next === undefined || next === s.lab.workingFlaskId) return true;
    return !flaskHasMaterial(s) && !s.lab.funnel.onFlask && !s.lab.flask.stoppered;
  },
  watch_glass_on_balance: (s) => s.lab.balance.pan === 'watch_glass',
  transfer_not_started: (s) => !s.lab.transfer.started,
  solid_on_watch_glass: (s) => s.lab.watchGlass.solid.value > 0,
  sufficient_solid: (s, a) =>
    a.type === 'remove_solid' && toGrams(a.mass) <= s.lab.watchGlass.solid.value + EPSILON,
  funnel_on_flask: (s) => s.lab.funnel.onFlask,
  funnel_not_on_flask: (s) => !s.lab.funnel.onFlask,
  flask_unstoppered: (s) => !s.lab.flask.stoppered,
  flask_stoppered: (s) => s.lab.flask.stoppered,
  stopper_state_changes: (s, a) =>
    a.type === 'stopper_flask' && a.inserted !== s.lab.flask.stoppered,
  flask_has_liquid: (s) => s.lab.flask.liquidVolume.value > 0,
  flask_has_solute: (s) => transferredMassG(s.lab) > 0,
  below_mark: (s) =>
    !s.lab.flask.madeUp &&
    s.lab.flask.capacity !== null &&
    s.lab.flask.liquidVolume.value < s.lab.flask.capacity.value - EPSILON,
  within_brim: (s, a, ctx) => {
    const capacity = s.lab.flask.capacity?.value;
    if (capacity === undefined) return false;
    const brim = capacity * boundNumber(ctx, 'flaskBrimFraction');
    return s.lab.flask.liquidVolume.value + addedVolumeCm3(a, ctx) <= brim + EPSILON;
  },
};

/** Returns the first failing precondition declared for the action, or null if all pass. */
export const firstFailingPrecondition = (
  state: SimulationState,
  action: Action,
  ctx: SimulationContext,
): PreconditionId | null => {
  const rule = ctx.definition.transitionRules.find((r) => r.action === action.type);
  if (!rule) throw new Error(`No transition rule for action ${action.type}`);
  return rule.preconditions.find((p) => !CHECKS[p](state, action, ctx)) ?? null;
};
