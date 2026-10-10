import type {
  Action,
  CanonicalStepId,
  LabState,
  ProcedureStep,
  SimulationState,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import { boundNumber } from './context';
import { balanceOffsetG, targetConcentration, targetMassG } from './lab';
import { EPSILON, roundToResolution } from './quantities';

/**
 * Canonical procedure support: when each step counts as done, and which action performs it.
 * Used for guided prompts, hints and the automatic demonstration. It never changes chemistry.
 */

const requiredApparatus = (ctx: SimulationContext) =>
  ctx.definition.apparatus.filter((a) => a.role === 'required');

const targetFlaskId = (ctx: SimulationContext): string => {
  const flask = requiredApparatus(ctx).find((a) => a.kind === 'volumetric_flask');
  if (!flask) throw new Error('Definition has no required volumetric flask');
  return flask.id;
};

const sliderTargetG = (lab: LabState, ctx: SimulationContext): number | null =>
  lab.balance.watchGlassReading
    ? roundToResolution(
        lab.balance.watchGlassReading.value + targetMassG(ctx.definition),
        boundNumber(ctx, 'balanceResolution'),
      )
    : null;

const solutePresent = (lab: LabState) =>
  lab.flask.soluteDissolved.value + lab.flask.soluteUndissolved.value > 0;
const allDissolved = (lab: LabState) =>
  solutePresent(lab) && lab.flask.soluteUndissolved.value === 0;

const DONE: Record<CanonicalStepId, (lab: LabState, ctx: SimulationContext) => boolean> = {
  confirm_safety: (lab) => lab.safetyConfirmed,
  select_apparatus: (lab, ctx) =>
    requiredApparatus(ctx).every((a) => lab.selectedApparatus.includes(a.id)) &&
    lab.workingFlaskId === targetFlaskId(ctx),
  clean_glassware: (lab, ctx) =>
    requiredApparatus(ctx)
      .filter((a) => a.requiresCleaning)
      .every((a) => lab.cleanliness[a.id] === 'clean'),
  weigh_watch_glass: (lab) => lab.balance.watchGlassReading !== null || lab.transfer.started,
  set_balance_sliders: (lab, ctx) => {
    if (lab.transfer.started) return true;
    const target = sliderTargetG(lab, ctx);
    return (
      target !== null &&
      lab.balance.sliderSetting !== null &&
      Math.abs(lab.balance.sliderSetting.value - target) <=
        boundNumber(ctx, 'sliderTolerance') + EPSILON
    );
  },
  add_solid: (lab, ctx) => {
    if (lab.transfer.started) return true;
    const offset = balanceOffsetG(lab);
    return (
      offset !== null && Math.abs(offset) <= boundNumber(ctx, 'balanceResolution') / 2 + EPSILON
    );
  },
  place_funnel: (lab) => lab.funnel.onFlask || lab.transfer.closed,
  transfer_solid: (lab) => lab.transfer.started,
  rinse_watch_glass: (lab) => lab.transfer.watchGlassRinsed || lab.transfer.closed,
  rinse_funnel: (lab) => lab.transfer.funnelRinsed || lab.transfer.closed,
  remove_funnel: (lab) => lab.transfer.closed && !lab.funnel.onFlask,
  add_dissolution_water: (lab, ctx) =>
    lab.flask.madeUp ||
    allDissolved(lab) ||
    lab.flask.liquidVolume.value >= boundNumber(ctx, 'demoDissolutionWater') - EPSILON,
  stopper_for_dissolution: (lab) => lab.flask.madeUp || allDissolved(lab) || lab.flask.stoppered,
  dissolve_solute: (lab) => lab.flask.madeUp || allDissolved(lab),
  unstopper_for_make_up: (lab) => lab.flask.madeUp || !lab.flask.stoppered,
  add_water_near_mark: (lab, ctx) =>
    lab.flask.madeUp ||
    (lab.flask.capacity !== null &&
      lab.flask.liquidVolume.value >=
        lab.flask.capacity.value - boundNumber(ctx, 'demoDropwiseMargin') - EPSILON),
  adjust_to_mark: (lab) => lab.flask.madeUp,
  stopper_for_mixing: (lab) => lab.risks.homogeneity === 'homogeneous' || lab.flask.stoppered,
  mix_solution: (lab) => lab.risks.homogeneity === 'homogeneous',
  apply_label: (lab) =>
    lab.label !== null && !lab.openErrors.some((e) => e.code === 'LABEL_INCORRECT'),
  submit_experiment: (lab) => lab.submitted,
};

export const isStepDone = (step: ProcedureStep, lab: LabState, ctx: SimulationContext): boolean =>
  DONE[step.stepId](lab, ctx);

/** First canonical step not yet done, or null when the procedure is complete. */
export const nextCanonicalStep = (
  state: SimulationState,
  ctx: SimulationContext,
): ProcedureStep | null =>
  ctx.definition.procedure.find((step) => !isStepDone(step, state.lab, ctx)) ?? null;

/** The correct action for a canonical step in the current state. */
export const canonicalAction = (
  step: ProcedureStep,
  state: SimulationState,
  ctx: SimulationContext,
): Action => {
  const { lab, meta } = state;
  const def = ctx.definition;
  const capacity = lab.flask.capacity?.value ?? 0;
  switch (step.stepId) {
    case 'confirm_safety':
      return {
        type: 'confirm_safety',
        checklistItemIds: def.safetyRules.filter((r) => r.kind === 'checklist').map((r) => r.id),
      };
    case 'select_apparatus':
      return { type: 'select_apparatus', apparatusIds: requiredApparatus(ctx).map((a) => a.id) };
    case 'clean_glassware':
      return {
        type: 'clean_glassware',
        apparatusIds: requiredApparatus(ctx)
          .filter((a) => a.requiresCleaning && lab.cleanliness[a.id] !== 'clean')
          .map((a) => a.id),
      };
    case 'weigh_watch_glass':
      return { type: 'weigh_watch_glass' };
    case 'set_balance_sliders':
      return {
        type: 'set_balance_sliders',
        mass: { value: sliderTargetG(lab, ctx) ?? targetMassG(def), unit: 'g' },
      };
    case 'add_solid': {
      const offset = balanceOffsetG(lab) ?? -targetMassG(def);
      const amount = roundToResolution(Math.abs(offset), boundNumber(ctx, 'balanceResolution'));
      return offset > 0
        ? { type: 'remove_solid', mass: { value: amount, unit: 'g' }, handContact: false }
        : { type: 'add_solid', mass: { value: amount, unit: 'g' }, handContact: false };
    }
    case 'place_funnel':
      return { type: 'place_funnel' };
    case 'transfer_solid':
      return { type: 'transfer_solid', fractionIntoFunnel: 1, handContact: false };
    case 'rinse_watch_glass':
      return { type: 'rinse_watch_glass', source: 'distilled' };
    case 'rinse_funnel':
      return { type: 'rinse_funnel', source: 'distilled' };
    case 'remove_funnel':
      return { type: 'remove_funnel' };
    case 'add_dissolution_water':
      return {
        type: 'add_water',
        volume: {
          value: Math.max(
            0,
            boundNumber(ctx, 'demoDissolutionWater') - lab.flask.liquidVolume.value,
          ),
          unit: 'cm3',
        },
        source: 'distilled',
      };
    case 'stopper_for_dissolution':
    case 'stopper_for_mixing':
      return { type: 'stopper_flask', inserted: true };
    case 'unstopper_for_make_up':
      return { type: 'stopper_flask', inserted: false };
    case 'dissolve_solute':
      return { type: 'dissolve_solute', grip: 'neck' };
    case 'add_water_near_mark':
      return {
        type: 'add_water',
        volume: {
          value: Math.max(
            0,
            capacity - boundNumber(ctx, 'demoDropwiseMargin') - lab.flask.liquidVolume.value,
          ),
          unit: 'cm3',
        },
        source: 'distilled',
      };
    case 'adjust_to_mark':
      return { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'level' };
    case 'mix_solution':
      return {
        type: 'mix_solution',
        inversions: Math.max(1, boundNumber(ctx, 'requiredInversions') - lab.flask.inversions),
        grip: 'neck',
      };
    case 'apply_label':
      return {
        type: 'apply_label',
        solutionName: 'Na2CO3',
        concentration: targetConcentration(def),
        preparationDate: meta.startedOn,
      };
    case 'submit_experiment':
      return { type: 'submit_experiment' };
  }
};
