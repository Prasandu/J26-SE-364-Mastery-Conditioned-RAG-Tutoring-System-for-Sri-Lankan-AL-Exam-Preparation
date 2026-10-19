import type { SceneItem, SceneModel } from '../sceneModel';
import { ApparatusDrawing } from './Apparatus2D';
import { itemBox } from './layout2d';

/**
 * Gradients and patterns used by every 2D drawing. Rendered once in the app root (hidden), so the
 * laboratory, the equipment tray and the illustrations share one set of IDs.
 */
export function Lab2DDefs() {
  return (
    <svg className="lab2d-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lab2d-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#edf4f7" />
          <stop offset="1" stopColor="#dae5eb" />
        </linearGradient>
        <pattern id="lab2d-tiles" width="48" height="32" patternUnits="userSpaceOnUse">
          <rect width="48" height="32" fill="#e4edf2" />
          <path d="M0 0 H48 M0 0 V32" stroke="#d3dee5" strokeWidth="1.5" />
        </pattern>
        <linearGradient id="lab2d-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#d9eef6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="lab2d-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cbe7f3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#a8d4e8" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="lab2d-bench" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#56646e" />
          <stop offset="1" stopColor="#74838e" />
        </linearGradient>
        <linearGradient id="lab2d-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef1f3" />
          <stop offset="1" stopColor="#bfc8ce" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const NO_LABEL = () => [];

/** Small picture of an apparatus item: the same drawing as in the 2D laboratory. */
export function ApparatusThumb({ item, model }: { item: SceneItem; model: SceneModel }) {
  const box = itemBox(item, 'bench');
  const pad = 10;
  return (
    <svg
      className="apparatus-thumb"
      viewBox={`${-box.w / 2 - pad} ${-box.h - pad} ${box.w + 2 * pad} ${box.h + 2 * pad}`}
      aria-hidden="true"
      focusable="false"
    >
      <ApparatusDrawing item={item} model={model} placement="bench" formatLabel={NO_LABEL} />
    </svg>
  );
}
