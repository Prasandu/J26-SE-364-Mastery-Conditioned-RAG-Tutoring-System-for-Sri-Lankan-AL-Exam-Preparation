import type { SceneItem } from '../sceneModel';

/**
 * Apparatus asset manifest.
 *
 * The 3D laboratory draws every apparatus with procedural Three.js geometry (see Apparatus3D.tsx).
 * This manifest is the seam for replacing a procedural item with an authored GLB without touching
 * the chemistry engine: when `model` is a real path the loader (`loadApparatusModel`) fetches it
 * and the flask-shell adapter can render it; while `model` is null the item keeps its procedural mesh, which is the
 * case for every entry today because no GLB has been authored yet.
 *
 * Why every `model` is null: authoring a professional GLB needs a 3D tool (Blender) and an artist.
 * Blender is not installed in this build environment, so the honest state is "infrastructure ready,
 * assets pending" — see docs/ASSET_SPEC.md. Generating a GLB programmatically here would only
 * re-encode the same procedural geometry, not improve it, so it is deliberately not done.
 *
 * R1 integrates the flask shell only. Other entries are specifications, not enabled renderers.
 * Keys are the trusted apparatus `kind` values from the experiment definition — never an
 * independent inventory. The loader falls back to procedural for any kind missing here.
 */

/** A named, independently controllable part of an apparatus (for state and animation). */
export interface AssetPart {
  readonly name: string;
  readonly required?: boolean;
  /** Authoring material role; the GLB supplies its own PBR materials. */
  readonly material: 'glass' | 'liquid' | 'metal' | 'plastic' | 'rubber' | 'paper' | 'solid';
}

export interface ApparatusAsset {
  /** Trusted apparatus kind (matches the experiment definition). */
  readonly kind: SceneItem['kind'];
  readonly nameKey: string;
  /** Published path to the GLB, or null while only the procedural mesh exists. */
  readonly model: string | null;
  readonly source: string;
  readonly licence: string;
  /** Scene units per model unit; display scale, never an experimental quantity. */
  readonly unitScale: number;
  /** Origin the model pivots and rests on, in model space. */
  readonly pivot: readonly [number, number, number];
  readonly parts: readonly AssetPart[];
  /** Visual states the asset must express (drive materials/morphs/sub-meshes). */
  readonly states: readonly string[];
  /** Name of the sub-mesh that receives pointer/raycast selection; null = whole object. */
  readonly selectionTarget: string | null;
  /** Always keep a procedural fallback so the scene never shows an empty slot. */
  readonly fallback: 'procedural';
  /** Optional named animation clips an authored GLB may ship. */
  readonly clips?: readonly string[];
}

const PENDING = {
  model: null,
  source: 'original (to be authored in Blender)',
  licence: 'pending provenance review (no asset supplied)',
  unitScale: 1,
  pivot: [0, 0, 0],
  fallback: 'procedural',
} as const;

/**
 * One entry per Experiment 4 apparatus kind. `model: null` everywhere → the procedural fallback is
 * used for all of them until authored GLBs are dropped in and their paths set here.
 */
export const APPARATUS_ASSETS: Readonly<Record<SceneItem['kind'], ApparatusAsset>> = {
  volumetric_flask: {
    ...PENDING,
    kind: 'volumetric_flask',
    nameKey: 'exp04.apparatus.volumetric_flask_250',
    parts: [
      { name: 'body', material: 'glass', required: true },
      { name: 'neck', material: 'glass', required: true },
      { name: 'calibration_mark', material: 'paper' },
      { name: 'stopper', material: 'rubber' },
      { name: 'liquid', material: 'liquid' },
    ],
    states: ['empty', 'filled_below_mark', 'at_mark', 'above_mark', 'stoppered', 'labelled'],
    selectionTarget: 'body',
  },
  balance: {
    ...PENDING,
    kind: 'balance',
    nameKey: 'exp04.apparatus.four_beam_balance',
    parts: [
      { name: 'base', material: 'metal' },
      { name: 'beams', material: 'metal' },
      { name: 'pan', material: 'metal' },
      { name: 'pointer', material: 'metal' },
    ],
    states: ['empty', 'loaded', 'pointer_below', 'pointer_at', 'pointer_above'],
    selectionTarget: 'pan',
  },
  watch_glass: {
    ...PENDING,
    kind: 'watch_glass',
    nameKey: 'exp04.apparatus.watch_glass',
    parts: [
      { name: 'dish', material: 'glass' },
      { name: 'solid', material: 'solid' },
    ],
    states: ['empty', 'with_solid', 'dirty'],
    selectionTarget: 'dish',
  },
  beaker: {
    ...PENDING,
    kind: 'beaker',
    nameKey: 'exp04.apparatus.beaker',
    parts: [
      { name: 'body', material: 'glass' },
      { name: 'liquid', material: 'liquid' },
    ],
    states: ['empty', 'with_liquid', 'dirty'],
    selectionTarget: 'body',
  },
  funnel: {
    ...PENDING,
    kind: 'funnel',
    nameKey: 'exp04.apparatus.funnel',
    parts: [{ name: 'body', material: 'glass' }],
    states: ['standing', 'on_flask', 'dirty'],
    selectionTarget: 'body',
  },
  wash_bottle: {
    ...PENDING,
    kind: 'wash_bottle',
    nameKey: 'exp04.apparatus.wash_bottle',
    parts: [
      { name: 'bottle', material: 'plastic' },
      { name: 'nozzle', material: 'plastic' },
    ],
    states: ['idle'],
    selectionTarget: 'bottle',
  },
  dropper: {
    ...PENDING,
    kind: 'dropper',
    nameKey: 'exp04.apparatus.dropper_or_glass_tube',
    parts: [
      { name: 'tube', material: 'glass' },
      { name: 'bulb', material: 'rubber' },
    ],
    states: ['idle'],
    selectionTarget: 'tube',
  },
  reagent: {
    ...PENDING,
    kind: 'reagent',
    nameKey: 'exp04.chemical.na2co3',
    parts: [
      { name: 'jar', material: 'glass' },
      { name: 'label', material: 'paper' },
      { name: 'contents', material: 'solid' },
    ],
    states: ['sealed'],
    selectionTarget: 'jar',
  },
};

/** The authored GLB path for a kind, or null when only the procedural mesh exists. */
export const assetModelFor = (kind: SceneItem['kind']): string | null =>
  APPARATUS_ASSETS[kind]?.model ?? null;
