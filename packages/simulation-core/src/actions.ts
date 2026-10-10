import type {
  Action,
  ActionOf,
  ErrorCode,
  LabState,
  MeasurementId,
  ObservationId,
  Quantity,
  SimulationState,
  WaterSource,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import { bound, boundNumber, paramRange } from './context';
import {
  achievedConcentration,
  apparatusById,
  cm3,
  freshLab,
  grams,
  pointerState,
  targetConcentration,
  targetMassG,
  targetVolumeCm3,
  toCm3,
  toGrams,
  transferredMassG,
} from './lab';
import { nextCanonicalStep } from './procedure';
import { convert, dimensionOf, EPSILON, roundToResolution } from './quantities';
import { nextRandom } from './rng';

/** Mutable working result of one accepted action. The engine converts it into events/feedback. */
export interface Outcome {
  lab: LabState;
  rngState: number;
  raised: ErrorCode[];
  resolved: ErrorCode[];
  /** Recoverable errors whose correction window closed (dropped from openErrors, not resolved). */
  windowClosed: ErrorCode[];
  measurements: { id: MeasurementId; quantity: Quantity }[];
  observations: ObservationId[];
  params: Set<string>;
  infoKeys: string[];
  metaPatch: { hints?: number; attempt?: number; retries?: number };
  hintUsed: boolean;
}

type Handler<T extends Action['type']> = (
  out: Outcome,
  action: ActionOf<T>,
  state: SimulationState,
  ctx: SimulationContext,
) => void;

/** Actions that count as starting laboratory work for the safety-preparation rule. */
const NON_LAB_ACTIONS = new Set<Action['type']>([
  'confirm_safety',
  'select_apparatus',
  'request_hint',
  'submit_experiment',
  'restart_experiment',
]);

// ------------------------------------------------------------------ shared effects

const addPurityRisk = (lab: LabState, code: ErrorCode, apparatusId: string | null) => {
  if (!lab.risks.purity.some((r) => r.code === code && r.apparatusId === apparatusId))
    lab.risks.purity.push({ code, apparatusId });
};

const useWater = (out: Outcome, source: WaterSource) => {
  if (source !== 'tap') return;
  out.raised.push('TAP_WATER_USED');
  addPurityRisk(out.lab, 'TAP_WATER_USED', null);
};

const observePointer = (out: Outcome, ctx: SimulationContext) => {
  const p = pointerState(out.lab, ctx);
  if (p) out.observations.push(p);
  out.params.add(bound(ctx, 'balanceResolution'));
};

const recordFinalMeasurements = (out: Outcome, ctx: SimulationContext) => {
  out.measurements.push({
    id: 'transferred_solute_mass',
    quantity: grams(transferredMassG(out.lab)),
  });
  if (out.lab.flask.finalVolume)
    out.measurements.push({ id: 'final_volume', quantity: out.lab.flask.finalVolume });
  const c = achievedConcentration(out.lab, ctx.definition);
  if (c.value) out.measurements.push({ id: 'achieved_concentration', quantity: c.value });
};

/** The liquid has reached (or passed) the calibration mark for the first time. */
const markMadeUp = (out: Outcome, finalVolumeCm3: number, ctx: SimulationContext) => {
  const { flask, risks } = out.lab;
  flask.madeUp = true;
  flask.liquidVolume = cm3(finalVolumeCm3);
  flask.finalVolume = cm3(finalVolumeCm3);
  flask.inversions = 0;
  risks.homogeneity = 'not_mixed';
  if (flask.soluteUndissolved.value > 0) {
    out.raised.push('UNDISSOLVED_AT_MARK');
    risks.volumeValidity = 'invalid';
  } else {
    risks.volumeValidity = 'valid';
  }
  recordFinalMeasurements(out, ctx);
};

/**
 * Every route by which water enters the flask (bulk addition, rinses) goes through here, so the
 * calibration-mark rules apply uniformly.
 */
const addLiquid = (
  out: Outcome,
  volumeCm3: number,
  source: WaterSource,
  ctx: SimulationContext,
) => {
  const { flask, risks } = out.lab;
  useWater(out, source);
  const capacity = flask.capacity?.value ?? 0;
  const newVolume = flask.liquidVolume.value + volumeCm3;
  if (flask.madeUp) {
    // Any further water after make-up increases the final volume and undoes mixing.
    if (volumeCm3 > EPSILON) {
      out.raised.push('OVERSHOOT_MARK');
      flask.liquidVolume = cm3(newVolume);
      flask.finalVolume = cm3(newVolume);
      flask.inversions = 0;
      risks.homogeneity = 'not_mixed';
      out.observations.push('liquid_above_mark');
      recordFinalMeasurements(out, ctx);
    }
    return;
  }
  if (newVolume > capacity + EPSILON) {
    out.raised.push('OVERSHOOT_MARK');
    out.observations.push('liquid_above_mark');
    markMadeUp(out, newVolume, ctx);
  } else if (Math.abs(newVolume - capacity) <= EPSILON) {
    out.observations.push('meniscus_at_mark');
    markMadeUp(out, capacity, ctx);
  } else {
    flask.liquidVolume = cm3(newVolume);
    out.observations.push('liquid_below_mark');
  }
};

/** Solid entering a flask already made up to the mark makes the final volume unreliable. */
const addSoluteToFlask = (out: Outcome, massG: number) => {
  if (massG <= 0) return;
  const { flask, risks } = out.lab;
  flask.soluteUndissolved = grams(flask.soluteUndissolved.value + massG);
  if (flask.madeUp) {
    out.raised.push('UNDISSOLVED_AT_MARK');
    risks.volumeValidity = 'invalid';
  }
};

/** Leaving the transfer phase: unrinsed residues are lost to the flask for this attempt. */
const closeTransferPhase = (out: Outcome, ctx: SimulationContext) => {
  const { transfer, watchGlass, funnel } = out.lab;
  if (!transfer.started || transfer.closed) return;
  transfer.closed = true;
  if (!transfer.watchGlassRinsed && watchGlass.residue.value > 0) {
    out.raised.push('WATCH_GLASS_NOT_RINSED');
    out.params.add(bound(ctx, 'watchGlassResidueFraction'));
  }
  if (!transfer.funnelRinsed && funnel.residue.value > 0) {
    out.raised.push('FUNNEL_NOT_RINSED');
    out.params.add(bound(ctx, 'funnelResidueFraction'));
  }
  transfer.lostResidue = grams(
    transfer.lostResidue.value + watchGlass.residue.value + funnel.residue.value,
  );
  watchGlass.residue = grams(0);
  funnel.residue = grams(0);
  out.measurements.push({
    id: 'transferred_solute_mass',
    quantity: grams(transferredMassG(out.lab)),
  });
};

/** Checks applied whenever the student commits to the prepared solution (label or submit). */
const checkMixing = (out: Outcome, ctx: SimulationContext) => {
  if (out.lab.flask.madeUp && out.lab.risks.homogeneity !== 'homogeneous') {
    out.raised.push('INSUFFICIENT_MIXING');
    out.params.add(bound(ctx, 'requiredInversions'));
  }
};

const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .replace(/[^a-z0-9]/g, '');

const dissolveAll = (out: Outcome) => {
  const { flask } = out.lab;
  if (flask.soluteUndissolved.value <= 0) return;
  flask.soluteDissolved = grams(flask.soluteDissolved.value + flask.soluteUndissolved.value);
  flask.soluteUndissolved = grams(0);
  out.observations.push('solid_dissolved');
};

const gripCheck = (out: Outcome, grip: 'neck' | 'body') => {
  if (grip === 'body') out.raised.push('FLASK_HELD_BY_BODY');
};

// ------------------------------------------------------------------ handlers

const HANDLERS: { [T in Action['type']]: Handler<T> } = {
  confirm_safety: (out, a, _s, ctx) => {
    const checklist = ctx.definition.safetyRules.filter((r) => r.kind === 'checklist');
    out.lab.safetyConfirmed = true;
    if (checklist.some((r) => !a.checklistItemIds.includes(r.id)))
      out.raised.push('SAFETY_CHECKLIST_INCOMPLETE');
  },

  select_apparatus: (out, a, _s, ctx) => {
    const { lab } = out;
    for (const id of a.apparatusIds)
      if (!lab.selectedApparatus.includes(id)) lab.selectedApparatus.push(id);
    const flaskId = a.apparatusIds.find(
      (id) => apparatusById(ctx.definition, id)?.kind === 'volumetric_flask',
    );
    if (flaskId && flaskId !== lab.workingFlaskId) {
      const capacity = apparatusById(ctx.definition, flaskId)?.capacity;
      if (!capacity) throw new Error(`Flask ${flaskId} has no capacity`);
      lab.workingFlaskId = flaskId;
      lab.flask = { ...freshLab(ctx.definition, 0).flask, capacity: cm3(toCm3(capacity.quantity)) };
    }
  },

  clean_glassware: (out, a) => {
    for (const id of a.apparatusIds) out.lab.cleanliness[id] = 'clean';
  },

  weigh_watch_glass: (out, _a, _s, ctx) => {
    const { lab } = out;
    lab.balance.pan = 'watch_glass';
    const reading = roundToResolution(
      lab.watchGlass.tareMass.value + lab.watchGlass.solid.value,
      boundNumber(ctx, 'balanceResolution'),
    );
    lab.balance.watchGlassReading = grams(reading);
    out.measurements.push({ id: 'watch_glass_mass', quantity: grams(reading) });
    observePointer(out, ctx);
  },

  set_balance_sliders: (out, a, _s, ctx) => {
    const { lab } = out;
    const setting = toGrams(a.mass);
    lab.balance.sliderSetting = grams(setting);
    out.measurements.push({ id: 'balance_slider_setting', quantity: grams(setting) });
    const resolution = boundNumber(ctx, 'balanceResolution');
    const tare =
      lab.balance.watchGlassReading?.value ??
      roundToResolution(lab.watchGlass.tareMass.value, resolution);
    const expected = tare + targetMassG(ctx.definition);
    out.params.add(bound(ctx, 'sliderTolerance'));
    if (Math.abs(setting - expected) > boundNumber(ctx, 'sliderTolerance') + EPSILON)
      out.raised.push('SLIDER_SETTING_INCORRECT');
    else out.resolved.push('SLIDER_SETTING_INCORRECT');
    observePointer(out, ctx);
  },

  add_solid: (out, a, _s, ctx) => {
    const { lab } = out;
    if (lab.watchGlass.solid.value === 0 && lab.cleanliness['watch_glass'] === 'dirty') {
      out.raised.push('DIRTY_GLASSWARE_USED');
      addPurityRisk(lab, 'DIRTY_GLASSWARE_USED', 'watch_glass');
    }
    if (a.handContact) out.raised.push('CHEMICAL_SKIN_CONTACT');
    lab.watchGlass.solid = grams(lab.watchGlass.solid.value + toGrams(a.mass));
    observePointer(out, ctx);
  },

  remove_solid: (out, a, _s, ctx) => {
    const { lab } = out;
    if (a.handContact) out.raised.push('CHEMICAL_SKIN_CONTACT');
    const remaining = lab.watchGlass.solid.value - toGrams(a.mass);
    lab.watchGlass.solid = grams(Math.abs(remaining) <= EPSILON ? 0 : remaining);
    observePointer(out, ctx);
  },

  place_funnel: (out) => {
    out.lab.funnel.onFlask = true;
  },

  transfer_solid: (out, a, _s, ctx) => {
    const { lab } = out;
    const weighed = lab.watchGlass.solid.value;
    lab.transfer.started = true;
    lab.transfer.weighedMass = grams(weighed);
    lab.balance.pan = 'empty';
    out.windowClosed.push('SLIDER_SETTING_INCORRECT');
    out.measurements.push({ id: 'weighed_solute_mass', quantity: grams(weighed) });

    const def = ctx.definition;
    out.params.add(bound(ctx, 'massTolerance'));
    if (Math.abs(weighed - targetMassG(def)) > boundNumber(ctx, 'massTolerance') + EPSILON)
      out.raised.push('MASS_OUT_OF_TOLERANCE');
    if (Math.abs((lab.flask.capacity?.value ?? 0) - targetVolumeCm3(def)) > EPSILON)
      out.raised.push('WRONG_FLASK_CAPACITY');
    const flaskId = lab.workingFlaskId;
    if (flaskId && lab.cleanliness[flaskId] === 'dirty') {
      out.raised.push('DIRTY_FLASK_USED');
      addPurityRisk(lab, 'DIRTY_FLASK_USED', flaskId);
    }
    if (lab.cleanliness['funnel'] === 'dirty') {
      out.raised.push('DIRTY_GLASSWARE_USED');
      addPurityRisk(lab, 'DIRTY_GLASSWARE_USED', 'funnel');
    }
    if (a.handContact) out.raised.push('CHEMICAL_SKIN_CONTACT');

    // Mass bookkeeping: spilled -> lost; film residues stay on watch glass and funnel until rinsed.
    const moved = weighed * a.fractionIntoFunnel;
    const spilled = weighed - moved;
    const wgResidue = moved * boundNumber(ctx, 'watchGlassResidueFraction');
    const intoFunnel = moved - wgResidue;
    const funnelResidue = intoFunnel * boundNumber(ctx, 'funnelResidueFraction');
    out.params
      .add(bound(ctx, 'watchGlassResidueFraction'))
      .add(bound(ctx, 'funnelResidueFraction'));

    lab.watchGlass.solid = grams(0);
    lab.watchGlass.residue = grams(wgResidue);
    lab.funnel.residue = grams(lab.funnel.residue.value + funnelResidue);
    addSoluteToFlask(out, intoFunnel - funnelResidue);
    lab.transfer.spilled = grams(spilled);
    if (spilled > EPSILON) {
      out.raised.push('INCOMPLETE_TRANSFER');
      out.observations.push('solid_spilled');
    }
    out.observations.push('solid_in_flask_undissolved');
  },

  rinse_watch_glass: (out, a, _s, ctx) => {
    const { lab } = out;
    addSoluteToFlask(out, lab.watchGlass.residue.value);
    lab.watchGlass.residue = grams(0);
    addLiquid(out, boundNumber(ctx, 'rinseVolume'), a.source, ctx);
    out.params.add(bound(ctx, 'rinseVolume'));
    if (lab.transfer.started) lab.transfer.watchGlassRinsed = true;
  },

  rinse_funnel: (out, a, _s, ctx) => {
    const { lab } = out;
    addSoluteToFlask(out, lab.funnel.residue.value);
    lab.funnel.residue = grams(0);
    addLiquid(out, boundNumber(ctx, 'rinseVolume'), a.source, ctx);
    out.params.add(bound(ctx, 'rinseVolume'));
    if (lab.transfer.started) lab.transfer.funnelRinsed = true;
  },

  remove_funnel: (out, _a, _s, ctx) => {
    out.lab.funnel.onFlask = false;
    closeTransferPhase(out, ctx);
  },

  add_water: (out, a, _s, ctx) => {
    addLiquid(out, toCm3(a.volume), a.source, ctx);
  },

  stopper_flask: (out, a) => {
    out.lab.flask.stoppered = a.inserted;
  },

  dissolve_solute: (out, a) => {
    gripCheck(out, a.grip);
    dissolveAll(out);
  },

  adjust_to_mark: (out, a, _s, ctx) => {
    const capacity = out.lab.flask.capacity?.value ?? 0;
    useWater(out, a.source);
    let finalVolume = capacity;
    if (a.eyeLevel !== 'level') {
      // Parallax (simulation assumption): eye above the mark -> meniscus looks low -> overfilled.
      const range = paramRange(ctx, bound(ctx, 'eyeLevelVolumeError'));
      const [r, next] = nextRandom(out.rngState);
      out.rngState = next;
      const magnitude = range.min + r * (range.max - range.min);
      finalVolume = capacity + (a.eyeLevel === 'above' ? magnitude : -magnitude);
      out.raised.push('EYE_LEVEL_INCORRECT');
      out.params.add(bound(ctx, 'eyeLevelVolumeError'));
    }
    out.observations.push('meniscus_at_mark');
    markMadeUp(out, finalVolume, ctx);
  },

  mix_solution: (out, a, _s, ctx) => {
    const { flask, risks } = out.lab;
    gripCheck(out, a.grip);
    dissolveAll(out);
    if (!flask.madeUp) return; // Mixing before make-up does not homogenise the final solution.
    flask.inversions += a.inversions;
    out.params.add(bound(ctx, 'requiredInversions'));
    if (flask.inversions >= boundNumber(ctx, 'requiredInversions')) {
      risks.homogeneity = 'homogeneous';
      out.observations.push('solution_homogeneous');
      out.resolved.push('INSUFFICIENT_MIXING');
    } else {
      risks.homogeneity = 'partially_mixed';
    }
  },

  apply_label: (out, a, state, ctx) => {
    closeTransferPhase(out, ctx);
    const def = ctx.definition;
    out.lab.label = {
      solutionName: a.solutionName,
      concentration: a.concentration,
      preparationDate: a.preparationDate,
    };
    const nameOk = def.expectedResults.label.acceptedSolutionNames.includes(
      normalizeName(a.solutionName),
    );
    const concOk =
      a.concentration !== null &&
      dimensionOf(a.concentration.unit) === 'concentration' &&
      Math.abs(convert(a.concentration, 'mol dm-3').value - targetConcentration(def).value) <=
        EPSILON;
    const dateOk = a.preparationDate === state.meta.startedOn;
    if (nameOk && concOk && dateOk) out.resolved.push('LABEL_INCORRECT');
    else out.raised.push('LABEL_INCORRECT');
    checkMixing(out, ctx);
  },

  request_hint: (out, _a, state, ctx) => {
    out.hintUsed = true;
    out.metaPatch.hints = state.meta.hints + 1;
    const step = nextCanonicalStep(state, ctx);
    if (!step) {
      out.infoKeys.push('engine.feedback.no_hint');
      return;
    }
    const level = state.meta.mode === 'guided' ? state.meta.guidanceLevel : null;
    out.infoKeys.push(
      level === 'intermediate' || level === 'advanced' || state.meta.mode === 'manual'
        ? step.hintKey
        : step.instructionKey,
    );
  },

  submit_experiment: (out, _a, _s, ctx) => {
    closeTransferPhase(out, ctx);
    const { lab } = out;
    // Completion requires the solution to exist: made up to the mark AND solute physically in the
    // flask. Uses the flask's solute mass, not the balance reading or the presence of a transfer.
    if (!lab.flask.madeUp || transferredMassG(lab) === 0) out.raised.push('INCOMPLETE_PROCEDURE');
    if (lab.label === null) out.raised.push('LABEL_MISSING');
    checkMixing(out, ctx);
    lab.submitted = true;
    recordFinalMeasurements(out, ctx);
    out.infoKeys.push('engine.feedback.submitted');
  },

  restart_experiment: (out, _a, state, ctx) => {
    const { lab, rngState } = newAttemptLab(state.meta.rngState, ctx);
    out.lab = lab;
    out.rngState = rngState;
    out.metaPatch.attempt = state.meta.attempt + 1;
    out.metaPatch.retries = state.meta.retries + 1;
    out.infoKeys.push('engine.feedback.restarted');
  },
};

/** Fresh laboratory with a seeded watch-glass mass; used at session start and on restart. */
export const newAttemptLab = (
  rngState: number,
  ctx: SimulationContext,
): { lab: LabState; rngState: number } => {
  const range = paramRange(ctx, bound(ctx, 'watchGlassMassRange'));
  const [r, next] = nextRandom(rngState);
  const tare = roundToResolution(
    range.min + r * (range.max - range.min),
    boundNumber(ctx, 'balanceResolution'),
  );
  return { lab: freshLab(ctx.definition, tare), rngState: next };
};

/** Lab state is plain JSON, so a JSON round-trip is an exact, environment-independent deep copy. */
const cloneLab = (lab: LabState): LabState => JSON.parse(JSON.stringify(lab)) as LabState;

export const applyAction = (
  state: SimulationState,
  action: Action,
  ctx: SimulationContext,
): Outcome => {
  const out: Outcome = {
    lab: cloneLab(state.lab),
    rngState: state.meta.rngState,
    raised: [],
    resolved: [],
    windowClosed: [],
    measurements: [],
    observations: [],
    params: new Set(),
    infoKeys: [],
    metaPatch: {},
    hintUsed: false,
  };
  if (!NON_LAB_ACTIONS.has(action.type) && !state.lab.safetyConfirmed)
    out.raised.push('SAFETY_NOT_CONFIRMED');
  (HANDLERS[action.type] as Handler<typeof action.type>)(out, action, state, ctx);
  return out;
};
