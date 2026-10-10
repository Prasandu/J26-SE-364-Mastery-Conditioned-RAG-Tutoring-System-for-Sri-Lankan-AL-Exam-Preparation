import type { ExperimentDefinition, LabState, Quantity, StageId } from '@vlab/contracts';
import type { SimulationContext } from './context';
import { boundNumber } from './context';
import { convert, EPSILON } from './quantities';

/** Internal storage units: masses in g, volumes in cm3. Inputs are converted at the boundary. */
export const grams = (value: number) => ({ value: Math.max(0, value), unit: 'g' as const });
export const cm3 = (value: number) => ({ value: Math.max(0, value), unit: 'cm3' as const });
export const toGrams = (q: Quantity): number => convert(q, 'g').value;
export const toCm3 = (q: Quantity): number => convert(q, 'cm3').value;

export const apparatusById = (def: ExperimentDefinition, id: string) =>
  def.apparatus.find((a) => a.id === id);

export const targetVolumeCm3 = (def: ExperimentDefinition): number =>
  toCm3(def.expectedResults.targetVolume.quantity);
export const targetMassG = (def: ExperimentDefinition): number =>
  toGrams(def.expectedResults.targetMass.quantity);
export const targetConcentration = (def: ExperimentDefinition): Quantity =>
  convert(def.expectedResults.targetConcentration.quantity, 'mol dm-3');

export const soluteMolarMass = (def: ExperimentDefinition): Quantity => {
  const solute = def.chemicals.find((c) => c.id === def.expectedResults.soluteChemicalId);
  if (!solute?.molarMass) throw new Error('Experiment definition lacks the solute molar mass');
  return convert(solute.molarMass.quantity, 'g mol-1');
};

export const freshLab = (def: ExperimentDefinition, watchGlassTareG: number): LabState => ({
  stage: 'safety',
  safetyConfirmed: false,
  selectedApparatus: [],
  cleanliness: Object.fromEntries(
    def.initialState.glassware.map((g) => [g.apparatusId, g.cleanliness]),
  ),
  workingFlaskId: null,
  balance: { pan: 'empty', sliderSetting: null, watchGlassReading: null },
  watchGlass: { tareMass: grams(watchGlassTareG), solid: grams(0), residue: grams(0) },
  funnel: { onFlask: false, residue: grams(0) },
  transfer: {
    started: false,
    closed: false,
    weighedMass: null,
    spilled: grams(0),
    lostResidue: grams(0),
    watchGlassRinsed: false,
    funnelRinsed: false,
  },
  flask: {
    capacity: null,
    soluteDissolved: grams(0),
    soluteUndissolved: grams(0),
    liquidVolume: cm3(0),
    stoppered: false,
    madeUp: false,
    finalVolume: null,
    inversions: 0,
  },
  label: null,
  risks: { purity: [], homogeneity: 'not_applicable', volumeValidity: 'not_made_up' },
  restartRequired: false,
  recordedErrors: [],
  openErrors: [],
  submitted: false,
});

export const transferredMassG = (lab: LabState): number =>
  lab.flask.soluteDissolved.value + lab.flask.soluteUndissolved.value;

export type ConcentrationResult =
  | { value: Quantity; unavailableReason: null }
  | { value: null; unavailableReason: 'not_made_up' | 'volume_invalid' };

/**
 * c = (transferred solute mass / molar mass) / final volume in dm3.
 * Derived only from modelled mass and volume; contamination and mixing never change it.
 */
export const achievedConcentration = (
  lab: LabState,
  def: ExperimentDefinition,
): ConcentrationResult => {
  if (!lab.flask.madeUp || !lab.flask.finalVolume)
    return { value: null, unavailableReason: 'not_made_up' };
  if (lab.risks.volumeValidity === 'invalid')
    return { value: null, unavailableReason: 'volume_invalid' };
  const amountMol = transferredMassG(lab) / soluteMolarMass(def).value;
  const volumeDm3 = convert(lab.flask.finalVolume, 'dm3').value;
  return { value: { value: amountMol / volumeDm3, unit: 'mol dm-3' }, unavailableReason: null };
};

/** Signed difference between balance pan load and slider setting (g), or null if not comparable. */
export const balanceOffsetG = (lab: LabState): number | null => {
  if (lab.balance.pan !== 'watch_glass' || !lab.balance.sliderSetting) return null;
  return (
    lab.watchGlass.tareMass.value + lab.watchGlass.solid.value - lab.balance.sliderSetting.value
  );
};

export const pointerState = (
  lab: LabState,
  ctx: SimulationContext,
): 'pointer_below_zero' | 'pointer_at_zero' | 'pointer_above_zero' | null => {
  const offset = balanceOffsetG(lab);
  if (offset === null) return null;
  const halfBand = boundNumber(ctx, 'balanceResolution') / 2 + EPSILON;
  if (Math.abs(offset) <= halfBand) return 'pointer_at_zero';
  return offset < 0 ? 'pointer_below_zero' : 'pointer_above_zero';
};

export const computeStage = (lab: LabState): StageId => {
  if (lab.submitted) return 'complete';
  if (!lab.safetyConfirmed && !lab.recordedErrors.includes('SAFETY_NOT_CONFIRMED')) return 'safety';
  if (!lab.transfer.started) return lab.balance.watchGlassReading === null ? 'setup' : 'weighing';
  if (!lab.transfer.closed) return 'transfer';
  if (!lab.flask.madeUp) return lab.flask.soluteUndissolved.value > 0 ? 'dissolution' : 'make_up';
  if (lab.risks.homogeneity !== 'homogeneous' && lab.label === null) return 'mixing';
  if (lab.label === null) return 'labelling';
  return 'review';
};

/** Physical invariants; violated only by an engine bug. Used by tests and replay verification. */
export const invariantViolations = (lab: LabState): string[] => {
  const v: string[] = [];
  const masses = {
    'watchGlass.solid': lab.watchGlass.solid.value,
    'watchGlass.residue': lab.watchGlass.residue.value,
    'funnel.residue': lab.funnel.residue.value,
    'flask.soluteDissolved': lab.flask.soluteDissolved.value,
    'flask.soluteUndissolved': lab.flask.soluteUndissolved.value,
    'transfer.spilled': lab.transfer.spilled.value,
    'transfer.lostResidue': lab.transfer.lostResidue.value,
  };
  for (const [name, value] of Object.entries(masses)) if (value < 0) v.push(`${name} < 0`);
  if (lab.flask.liquidVolume.value < 0) v.push('flask.liquidVolume < 0');
  const weighed = lab.transfer.weighedMass?.value;
  if (weighed !== undefined) {
    const transferred = transferredMassG(lab);
    if (transferred > weighed + EPSILON) v.push('transferred mass exceeds weighed mass');
    const accounted =
      transferred +
      lab.transfer.spilled.value +
      lab.transfer.lostResidue.value +
      lab.watchGlass.residue.value +
      lab.funnel.residue.value;
    if (Math.abs(accounted - weighed) > 1e-6) v.push('solute mass not conserved');
  } else if (transferredMassG(lab) > 0) {
    v.push('solute in flask without a weighed transfer');
  }
  if (lab.flask.soluteDissolved.value > transferredMassG(lab) + EPSILON)
    v.push('dissolved mass exceeds transferred mass');
  return v;
};
