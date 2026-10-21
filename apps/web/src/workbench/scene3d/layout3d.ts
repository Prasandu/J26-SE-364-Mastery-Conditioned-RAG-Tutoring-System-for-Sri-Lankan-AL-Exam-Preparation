import { FLASK_MARK_Y, FLASK_PROFILE } from '../flaskProfile';
import { placementOf, type SceneItem, type SceneModel } from '../sceneModel';

/**
 * 3D coordinates (scene units, y up, bench surface at y = 0). Presentation only: placements come
 * from the shared `placementOf` rule, so this renderer and the 2D renderer always agree.
 */
export type Vec3 = [number, number, number];

/** Raised shelf at the back of the bench for apparatus not yet taken onto the bench. */
export const RISER = { x: 0.9, z: -2.15, width: 7.4, depth: 0.7, height: 0.6 } as const;

const BENCH: Record<string, [number, number]> = {
  four_beam_balance: [-3.1, 0.35],
  watch_glass: [-1.7, 1.25],
  reagent_na2co3: [-1.5, -0.55],
  dropper_or_glass_tube: [-0.55, 1.75],
  volumetric_flask_250: [0.2, 0.3],
  volumetric_flask_100: [1.4, -0.5],
  volumetric_flask_500: [2.65, -0.55],
  funnel: [1.3, 1.3],
  beaker: [2.35, 1.4],
  wash_bottle: [3.5, 0.95],
};

const SHELF_X: Record<string, number> = {
  watch_glass: -2.2,
  funnel: -1.45,
  beaker: -0.6,
  volumetric_flask_100: 0.3,
  volumetric_flask_250: 1.3,
  volumetric_flask_500: 2.5,
  wash_bottle: 3.5,
  dropper_or_glass_tube: 4.15,
};

/** Spare position on the bench back-left, used for the balance when not yet selected. */
const BALANCE_PARKED: Vec3 = [-3.3, 0, -1.65];

/** Balance pan top, relative to the balance origin. */
export const PAN_TOP: Vec3 = [-0.55, 0.64, 0];

export const FLASK_TOP_Y = FLASK_PROFILE.at(-1)![1];

export const itemPosition3D = (item: SceneItem, model: SceneModel): Vec3 => {
  const placement = placementOf(item, model);
  if (placement === 'on_balance') {
    const balance = model.items.find((i) => i.kind === 'balance');
    const [x, y, z] = balance ? itemPosition3D(balance, model) : [0, 0, 0];
    return [x + PAN_TOP[0], y + PAN_TOP[1], z + PAN_TOP[2]];
  }
  if (placement === 'on_flask') {
    const flask = model.items.find((i) => i.id === model.workingFlaskId);
    if (flask) {
      const [x, y, z] = itemPosition3D(flask, model);
      return [x, y + FLASK_TOP_Y * flask.scale - 0.14, z];
    }
  }
  if (placement === 'shelf') {
    if (item.kind === 'balance') return BALANCE_PARKED;
    return [SHELF_X[item.id] ?? 4, RISER.height, RISER.z];
  }
  const [x, z] = BENCH[item.id] ?? [4, 1.8];
  return [x, 0, z];
};

export type CameraPreset = 'overview' | 'balance' | 'mark';

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/**
 * Oblique overview shows the depth of the worktop and cabinets while retaining the full apparatus
 * span. Narrow canvases use the fitted pose below. Browser interaction helpers project through
 * the same pose so picking checks follow the real camera.
 */
export const OVERVIEW_POSE: CameraPose = { position: [3.6, 4.2, 8.8], target: [0, 0.75, -0.8] };

/** Fit the full apparatus span in a narrow canvas without changing close-up presets. */
export const fittedOverviewPose = (aspect: number): CameraPose => {
  const factor = Math.max(1, 2 / Math.max(0.5, aspect));
  return {
    target: [...OVERVIEW_POSE.target],
    position: OVERVIEW_POSE.position.map((value, axis) => {
      const target = OVERVIEW_POSE.target[axis]!;
      return target + (value - target) * factor;
    }) as Vec3,
  };
};

/** Camera poses derived from where the balance and the flask currently are. */
export const cameraPose = (preset: CameraPreset, model: SceneModel): CameraPose => {
  if (preset === 'balance') {
    const balance = model.items.find((i) => i.kind === 'balance');
    if (!balance) return OVERVIEW_POSE;
    const [x, y, z] = itemPosition3D(balance, model);
    return { position: [x + 0.35, y + 1.6, z + 2.6], target: [x - 0.1, y + 0.45, z] };
  }
  if (preset === 'mark') {
    const flask =
      model.items.find((i) => i.id === model.workingFlaskId) ??
      model.items.find((i) => i.kind === 'volumetric_flask');
    if (!flask) return OVERVIEW_POSE;
    const [x, y, z] = itemPosition3D(flask, model);
    const markY = y + FLASK_MARK_Y * flask.scale;
    // Eye level with the calibration mark, as the handbook's meniscus reading requires.
    return { position: [x, markY, z + 2.7], target: [x, markY, z] };
  }
  return OVERVIEW_POSE;
};
