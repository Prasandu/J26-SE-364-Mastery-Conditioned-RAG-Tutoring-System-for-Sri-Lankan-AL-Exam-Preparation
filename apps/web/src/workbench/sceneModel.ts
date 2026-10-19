import type { ExperimentDefinition, ObservationId, Quantity, SessionView } from '@vlab/contracts';

/** Item shown on the bench. Apparatus IDs come from the definition; the reagent jar is visual only. */
export const REAGENT_ITEM_ID = 'reagent_na2co3';

/**
 * Where an item is drawn. Shared by the 2D and 3D renderers so both always agree; each renderer
 * only maps a placement to its own coordinates.
 */
export type Placement = 'shelf' | 'bench' | 'on_balance' | 'on_flask';

export interface SceneItem {
  id: string;
  kind: ExperimentDefinition['apparatus'][number]['kind'] | 'reagent';
  nameKey: string;
  /** Chosen in the UI (pending select_apparatus) or focused. */
  highlighted: boolean;
  /** Accepted onto the bench by the engine. */
  onBench: boolean;
  /** Publicly projected cleanliness (null when the item has no cleanliness state). */
  cleanliness: 'clean' | 'dirty' | null;
  /** Relative display size (flasks by capacity); 1 for everything else. */
  scale: number;
}

export type PointerState = 'below' | 'at' | 'above';

export interface SceneModel {
  items: SceneItem[];
  workingFlaskId: string | null;
  watchGlassHasSolid: boolean;
  watchGlassOnBalance: boolean;
  funnelOnFlask: boolean;
  balance: {
    sliderSetting: Quantity | null;
    watchGlassReading: Quantity | null;
    /** Latest pointer observation while the watch glass is on the pan (engine observation). */
    pointer: PointerState | null;
  };
  /** Liquid height as a share of the calibration mark (display scale only). */
  liquidLevel: number;
  /** Latest perceived level, as an engine observation ID. */
  levelObservation: Extract<
    ObservationId,
    'liquid_below_mark' | 'meniscus_at_mark' | 'liquid_above_mark'
  > | null;
  undissolvedVisible: boolean;
  /** A `solid_spilled` observation was recorded in this attempt. */
  spilled: boolean;
  stoppered: boolean;
  labelAttached: boolean;
  label: SessionView['bench']['label'];
  /** Validity marker; only available when the projection discloses validity. */
  warning: boolean;
  /** Formula printed on the reagent jar (from the definition), e.g. "Na₂CO₃". */
  reagentFormula: string | null;
}

const LEVEL: Record<SessionView['bench']['liquid'], SceneModel['levelObservation']> = {
  empty: null,
  below_mark: 'liquid_below_mark',
  at_mark: 'meniscus_at_mark',
  above_mark: 'liquid_above_mark',
};

const POINTER: Partial<Record<ObservationId, PointerState>> = {
  pointer_below_zero: 'below',
  pointer_at_zero: 'at',
  pointer_above_zero: 'above',
};

/** Flask display size by capacity (cube-root scaling, comparable units only). */
const flaskScales = (definition: ExperimentDefinition): Map<string, number> => {
  const flasks = definition.apparatus.filter((a) => a.kind === 'volumetric_flask' && a.capacity);
  const unit = flasks[0]?.capacity?.quantity.unit;
  if (!flasks.every((f) => f.capacity?.quantity.unit === unit)) return new Map();
  const largest = Math.max(...flasks.map((f) => f.capacity!.quantity.value));
  return new Map(flasks.map((f) => [f.id, 1.25 * Math.cbrt(f.capacity!.quantity.value / largest)]));
};

const subscriptDigits = (formula: string): string =>
  formula.replace(/\d/g, (d) => String.fromCharCode(0x2080 + Number(d)));

/** Shared placement rule for both renderers. */
export const placementOf = (item: SceneItem, model: SceneModel): Placement => {
  if (item.kind === 'watch_glass' && model.watchGlassOnBalance) return 'on_balance';
  if (item.kind === 'funnel' && model.funnelOnFlask && model.workingFlaskId) return 'on_flask';
  return item.onBench ? 'bench' : 'shelf';
};

/**
 * Pure mapping from the public session projection to visual descriptors. It contains no experiment
 * rules and can only show what the projection already discloses.
 */
export const buildSceneModel = (
  view: SessionView,
  definition: ExperimentDefinition,
  ui: { pendingApparatus: string[]; focusedItem: string | null },
): SceneModel => {
  const { bench } = view;
  const solute = definition.chemicals.find(
    (c) => c.id === definition.expectedResults.soluteChemicalId,
  );
  const soluteName = solute?.nameKey ?? '';
  const scales = flaskScales(definition);
  const attemptObservations = view.events
    .filter((e) => e.attempt === view.attempt && e.accepted)
    .map((e) => e.observations);
  const latestPointer = attemptObservations
    .map((obs) => obs.map((o) => POINTER[o]).find(Boolean))
    .filter(Boolean)
    .at(-1);
  const watchGlassOnBalance = bench.balance.pan === 'watch_glass';
  return {
    items: [
      ...definition.apparatus.map((a) => ({
        id: a.id,
        kind: a.kind,
        nameKey: a.nameKey,
        highlighted: ui.pendingApparatus.includes(a.id) || ui.focusedItem === a.id,
        onBench: bench.selectedApparatus.includes(a.id),
        cleanliness: bench.cleanliness[a.id] ?? null,
        scale: scales.get(a.id) ?? 1,
      })),
      {
        id: REAGENT_ITEM_ID,
        kind: 'reagent' as const,
        nameKey: soluteName,
        highlighted: ui.focusedItem === REAGENT_ITEM_ID,
        onBench: true,
        cleanliness: null,
        scale: 1,
      },
    ],
    workingFlaskId: bench.workingFlaskId,
    watchGlassHasSolid: bench.watchGlassHasSolid,
    watchGlassOnBalance,
    funnelOnFlask: bench.funnelOnFlask,
    balance: {
      sliderSetting: bench.balance.sliderSetting,
      watchGlassReading: bench.balance.watchGlassReading,
      pointer: watchGlassOnBalance ? (latestPointer ?? null) : null,
    },
    liquidLevel: bench.liquidFraction,
    levelObservation: LEVEL[bench.liquid],
    undissolvedVisible: bench.undissolvedVisible,
    spilled: attemptObservations.some((obs) => obs.includes('solid_spilled')),
    stoppered: bench.stoppered,
    labelAttached: bench.label !== null,
    label: bench.label,
    warning:
      view.validity !== null &&
      (view.validity.purityRisks.length > 0 || view.validity.volumeValidity === 'invalid'),
    reagentFormula: solute?.formula ? subscriptDigits(solute.formula) : null,
  };
};
