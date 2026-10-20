import { FLASK_PROFILE } from '../flaskProfile';
import { placementOf, type Placement, type SceneItem, type SceneModel } from '../sceneModel';

/**
 * 2D coordinates (SVG user units). Presentation only: the placement itself comes from the shared
 * `placementOf` rule, so the 2D and 3D renderers always show the same arrangement.
 */
/**
 * The drawing is deliberately wide and short (~2.1:1), because that is the shape of the stage the
 * desktop workbench actually gives it — measured, not assumed. The previous 16:9-ish frame was
 * letterboxed inside a much wider box, which both shrank the apparatus and left big empty bands
 * at the sides. Keeping these in step means the scene fills its panel edge to edge.
 */
export const VIEW_W = 1280;
export const VIEW_H = 525;
export const SHELF_Y = 225;
/** Back edge of the bench top (drawn in depth) and the front edge. The band of plain wall between
 * the shelf ledge and the bench — 232 units of nothing in the original layout — is now 75, and
 * the apparatus occupy most of the frame instead of a thin strip along the bottom. */
export const BENCH_BACK_Y = 340;
export const BENCH_Y = 515;
/** Pixels per flask-profile unit at scale 1. */
export const FLASK_UNIT = 88;
export const FLASK_HEIGHT = FLASK_PROFILE.at(-1)![1];

/** Stored items are drawn smaller; front-row bench items larger (simple depth cue). Scales raised
 * substantially from the original (0.8 / 1.1 / 1.22) so apparatus are easy to identify without
 * zooming in — the single biggest lever on "apparatus look too small". */
const SHELF_SCALE = 0.95;
const BACK_ROW = { y: 435, s: 1.45 } as const;
const FRONT_ROW = { y: 505, s: 1.65 } as const;

const SHELF_X: Record<string, number> = {
  four_beam_balance: 150,
  watch_glass: 312,
  funnel: 402,
  beaker: 492,
  volumetric_flask_100: 582,
  volumetric_flask_250: 690,
  volumetric_flask_500: 820,
  wash_bottle: 950,
  dropper_or_glass_tube: 1040,
};

/** Bench slots: tall apparatus in the back row, small apparatus in the front row. */
const BENCH_SLOT: Record<string, { x: number; row: typeof BACK_ROW | typeof FRONT_ROW }> = {
  four_beam_balance: { x: 236, row: BACK_ROW },
  reagent_na2co3: { x: 446, row: BACK_ROW },
  volumetric_flask_250: { x: 604, row: BACK_ROW },
  volumetric_flask_100: { x: 756, row: BACK_ROW },
  volumetric_flask_500: { x: 924, row: BACK_ROW },
  wash_bottle: { x: 1126, row: BACK_ROW },
  watch_glass: { x: 430, row: FRONT_ROW },
  dropper_or_glass_tube: { x: 610, row: FRONT_ROW },
  funnel: { x: 800, row: FRONT_ROW },
  beaker: { x: 990, row: FRONT_ROW },
};

/** Balance pan top, relative to the balance origin (unscaled drawing units). */
export const PAN_OFFSET = { x: -72, y: -104 } as const;

/** Base point (bottom centre) of an item and its drawing scale. */
export interface Point {
  x: number;
  y: number;
  s: number;
}

export const itemPosition = (item: SceneItem, model: SceneModel): Point => {
  const placement = placementOf(item, model);
  if (placement === 'on_balance') {
    const balance = model.items.find((i) => i.kind === 'balance');
    const o = balance ? itemPosition(balance, model) : { x: 236, y: BACK_ROW.y, s: BACK_ROW.s };
    return { x: o.x + PAN_OFFSET.x * o.s, y: o.y + PAN_OFFSET.y * o.s, s: o.s };
  }
  if (placement === 'on_flask') {
    const flask = model.items.find((i) => i.id === model.workingFlaskId);
    if (flask) {
      const b = itemPosition(flask, model);
      const top = FLASK_HEIGHT * FLASK_UNIT * flask.scale * b.s;
      return { x: b.x, y: b.y - top + 26 * b.s, s: b.s };
    }
  }
  if (placement === 'shelf') return { x: SHELF_X[item.id] ?? 1100, y: SHELF_Y, s: SHELF_SCALE };
  const slot = BENCH_SLOT[item.id] ?? { x: 1180, row: FRONT_ROW };
  return { x: slot.x, y: slot.row.y + (item.kind === 'dropper' ? 6 : 0), s: slot.row.s };
};

/** Approximate drawing box above the base point, for focus rings, highlights and zoom. */
export const itemBox = (item: SceneItem, placement: Placement): { w: number; h: number } => {
  switch (item.kind) {
    case 'volumetric_flask':
      return { w: 1.2 * FLASK_UNIT * item.scale, h: FLASK_HEIGHT * FLASK_UNIT * item.scale + 6 };
    case 'balance':
      return { w: 244, h: 118 };
    case 'watch_glass':
      return { w: 86, h: 26 };
    case 'funnel':
      return { w: 78, h: 92 };
    case 'beaker':
      return { w: 76, h: 86 };
    case 'wash_bottle':
      return { w: 74, h: 124 };
    case 'dropper':
      return placement === 'shelf' ? { w: 26, h: 104 } : { w: 104, h: 24 };
    case 'reagent':
      return { w: 70, h: 92 };
  }
};

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OVERVIEW: ViewBox = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
const MIN_W = 360;

/**
 * Below this panel width the full-room overview stops being readable: the whole 1280-unit frame
 * drawn into ~360 CSS px puts the apparatus at roughly a quarter size, which is what made the
 * laboratory unusable on a phone.
 */
export const NARROW_PANEL_PX = 560;

/**
 * The overview used when the panel is narrow: the apparatus span, with the empty margins of the
 * room cropped away.
 *
 * On-screen size is `panelWidth / viewBoxWidth`, so the only way to draw the apparatus larger on a
 * phone is to show less width — and cropping far enough to make a real difference starts hiding
 * apparatus. An earlier 760-unit frame put the four-beam balance (x=150) and the dropper (x=1040)
 * outside the view entirely, which is worse than small. This therefore crops only as far as the
 * outermost apparatus allow, so nothing becomes unreachable; the close-up presets, the zoom
 * controls and the accessible equipment list are the routes to inspecting an individual item.
 */
const APPARATUS_SPAN = { from: 70, to: 1130 } as const;
export const narrowOverview = (): ViewBox =>
  clampView({
    x: APPARATUS_SPAN.from,
    y: 0,
    w: APPARATUS_SPAN.to - APPARATUS_SPAN.from,
    h: 0,
  });

/** Keeps a view box inside the drawing and at the drawing's aspect ratio. */
export const clampView = (v: ViewBox): ViewBox => {
  const w = Math.min(VIEW_W, Math.max(MIN_W, v.w));
  const h = (w * VIEW_H) / VIEW_W;
  return {
    w,
    h,
    x: Math.min(VIEW_W - w, Math.max(0, v.x)),
    y: Math.min(VIEW_H - h, Math.max(0, v.y)),
  };
};

export const zoomView = (v: ViewBox, factor: number): ViewBox => {
  const w = v.w * factor;
  const h = v.h * factor;
  return clampView({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h });
};

/** A close-up framing the given item. */
export const focusView = (item: SceneItem, model: SceneModel, width: number): ViewBox => {
  const p = itemPosition(item, model);
  const box = itemBox(item, placementOf(item, model));
  const h = (width * VIEW_H) / VIEW_W;
  return clampView({ x: p.x - width / 2, y: p.y - (box.h * p.s) / 2 - h / 2, w: width, h });
};
