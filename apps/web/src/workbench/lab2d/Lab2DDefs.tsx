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
        {/* Vertical body sheen. The horizontal `lab2d-glass` gradient alone reads as a flat
            cut-out; real glassware is brightest where the wall turns away from the viewer at the
            top and pools darker toward the base, which is what this adds over the fill. */}
        <linearGradient id="lab2d-glass-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#e4f0f6" stopOpacity="0.1" />
          <stop offset="1" stopColor="#8fb2c4" stopOpacity="0.36" />
        </linearGradient>
        {/* Light pooling through the base of a vessel: the single strongest cue that a shape is
            glass rather than an outline. */}
        <radialGradient id="lab2d-caustic" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3d6376" stopOpacity="0.34" />
          <stop offset="1" stopColor="#3d6376" stopOpacity="0" />
        </radialGradient>
        {/* Rim of an open vessel, lit from the left like every other apparatus here. */}
        <linearGradient id="lab2d-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#cfe0e9" />
          <stop offset="1" stopColor="#9bb6c4" />
        </linearGradient>
        <linearGradient id="lab2d-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cbe7f3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#a8d4e8" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="lab2d-bench" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#56646e" />
          <stop offset="1" stopColor="#74838e" />
        </linearGradient>
        {/* Contact shading where the bench meets the back panel. A flat worktop reads as a slab of
            colour; darkening the few units nearest the wall is what gives it a surface. */}
        <linearGradient id="lab2d-bench-ao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2630" stopOpacity="0.45" />
          <stop offset="1" stopColor="#1b2630" stopOpacity="0" />
        </linearGradient>
        {/* Light catching the front lip of the worktop, so the bench has a visible near edge. */}
        <linearGradient id="lab2d-bench-lip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="lab2d-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef1f3" />
          <stop offset="0.45" stopColor="#c3ccd2" />
          <stop offset="1" stopColor="#8d98a1" />
        </linearGradient>
        <linearGradient id="lab2d-metal-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6670" />
          <stop offset="1" stopColor="#333c43" />
        </linearGradient>
        <linearGradient id="lab2d-plastic" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#dcebf2" />
          <stop offset="1" stopColor="#b9d4e0" />
        </linearGradient>
        <radialGradient id="lab2d-base-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#1a2630" stopOpacity="0.26" />
          <stop offset="1" stopColor="#1a2630" stopOpacity="0" />
        </radialGradient>
        <filter id="lab2d-drop-shadow" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#1a2630" floodOpacity="0.24" />
        </filter>
        <filter id="lab2d-soft-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1a2630" floodOpacity="0.2" />
        </filter>
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
