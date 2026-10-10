import type { ExperimentDefinition, ObservationId, SessionView } from '@vlab/contracts';

/** Item shown on the bench. Apparatus IDs come from the definition; the reagent jar is visual only. */
export const REAGENT_ITEM_ID = 'reagent_na2co3';

export interface SceneItem {
  id: string;
  kind: ExperimentDefinition['apparatus'][number]['kind'] | 'reagent';
  nameKey: string;
  /** Chosen in the UI (pending select_apparatus) or focused. */
  highlighted: boolean;
  /** Accepted onto the bench by the engine. */
  onBench: boolean;
}

export interface SceneModel {
  items: SceneItem[];
  workingFlaskId: string | null;
  watchGlassHasSolid: boolean;
  watchGlassOnBalance: boolean;
  funnelOnFlask: boolean;
  /** Liquid height as a share of the calibration mark (display scale only). */
  liquidLevel: number;
  /** Latest perceived level, as an engine observation ID. */
  levelObservation: Extract<
    ObservationId,
    'liquid_below_mark' | 'meniscus_at_mark' | 'liquid_above_mark'
  > | null;
  undissolvedVisible: boolean;
  stoppered: boolean;
  labelAttached: boolean;
  /** Validity marker; only available when the projection discloses validity. */
  warning: boolean;
}

const LEVEL: Record<SessionView['bench']['liquid'], SceneModel['levelObservation']> = {
  empty: null,
  below_mark: 'liquid_below_mark',
  at_mark: 'meniscus_at_mark',
  above_mark: 'liquid_above_mark',
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
  const soluteName =
    definition.chemicals.find((c) => c.id === definition.expectedResults.soluteChemicalId)
      ?.nameKey ?? '';
  return {
    items: [
      ...definition.apparatus.map((a) => ({
        id: a.id,
        kind: a.kind,
        nameKey: a.nameKey,
        highlighted: ui.pendingApparatus.includes(a.id) || ui.focusedItem === a.id,
        onBench: bench.selectedApparatus.includes(a.id),
      })),
      {
        id: REAGENT_ITEM_ID,
        kind: 'reagent' as const,
        nameKey: soluteName,
        highlighted: ui.focusedItem === REAGENT_ITEM_ID,
        onBench: true,
      },
    ],
    workingFlaskId: bench.workingFlaskId,
    watchGlassHasSolid: bench.watchGlassHasSolid,
    watchGlassOnBalance: bench.balance.pan === 'watch_glass',
    funnelOnFlask: bench.funnelOnFlask,
    liquidLevel: bench.liquidFraction,
    levelObservation: LEVEL[bench.liquid],
    undissolvedVisible: bench.undissolvedVisible,
    stoppered: bench.stoppered,
    labelAttached: bench.label !== null,
    warning:
      view.validity !== null &&
      (view.validity.purityRisks.length > 0 || view.validity.volumeValidity === 'invalid'),
  };
};
