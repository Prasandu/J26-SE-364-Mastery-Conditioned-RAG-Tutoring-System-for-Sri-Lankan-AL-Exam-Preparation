import {
  FLASK_MARK_Y,
  FLASK_PROFILE,
  flaskRadiusAt,
  liquidHeight,
  liquidProfile,
} from '../../workbench/flaskProfile';
import type { PointerState } from '../../workbench/sceneModel';

/**
 * R1 prototype apparatus art (chemistry-lab-advanced-sim-r1). Original illustrations, authored
 * directly as SVG paths/gradients/filters — no traced, downloaded or LabXchange imagery. Reuses
 * the production flask profile data (`flaskProfile.ts`) so proportions stay scientifically
 * identical to the shipped renderer; only the rendering technique (shading, depth, highlights,
 * drop shadows) is new.
 */

const mirrored = (pts: readonly (readonly [number, number])[], s: number): string => {
  const right = pts.map(([r, y]) => `${(r * s).toFixed(1)} ${(-y * s).toFixed(1)}`);
  const left = [...pts].reverse().map(([r, y]) => `${(-r * s).toFixed(1)} ${(-y * s).toFixed(1)}`);
  return `M${right.join(' L')} L${left.join(' L')} Z`;
};

/** Shared gradient/filter defs for the R1 prototype only (own `r1-` id namespace). */
export function R1Defs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="r1-glass-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.14" stopColor="#dff0f7" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#bcdeec" stopOpacity="0.32" />
          <stop offset="0.86" stopColor="#dff0f7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id="r1-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe4f3" stopOpacity="0.96" />
          <stop offset="1" stopColor="#8fc7e2" stopOpacity="0.98" />
        </linearGradient>
        <radialGradient id="r1-base-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#1a2630" stopOpacity="0.28" />
          <stop offset="1" stopColor="#1a2630" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="r1-watchglass-dish" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#d9eef6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#aed2e3" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="r1-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef1f3" />
          <stop offset="0.45" stopColor="#c3ccd2" />
          <stop offset="1" stopColor="#8d98a1" />
        </linearGradient>
        <linearGradient id="r1-metal-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6670" />
          <stop offset="1" stopColor="#333c43" />
        </linearGradient>
        <linearGradient id="r1-lcd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26322c" />
          <stop offset="1" stopColor="#111a16" />
        </linearGradient>
        <filter id="r1-drop-shadow" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#1a2630" floodOpacity="0.28" />
        </filter>
        <filter id="r1-soft-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1a2630" floodOpacity="0.22" />
        </filter>
        <filter id="r1-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

const GLASS_STROKE = '#527689';
const INK = '#243038';

/** Volumetric flask illustration (any capacity; `unit` is scene units in px, set by the caller). */
export function R1Flask({
  unit,
  level,
  undissolved,
  dirty,
  selected,
}: {
  unit: number;
  level: number;
  undissolved: boolean;
  dirty: boolean;
  selected: boolean;
}) {
  const h = liquidHeight(level);
  const top = FLASK_PROFILE.at(-1)![1] * unit;
  const markR = flaskRadiusAt(FLASK_MARK_Y) * unit;
  const surfaceR = Math.max(0.006, flaskRadiusAt(h) - 0.02) * unit;

  return (
    <g filter="url(#r1-drop-shadow)">
      <ellipse cx={0} cy={4} rx={0.52 * unit} ry={10} fill="url(#r1-base-shadow)" />
      {h > 0 && (
        <g clipPath="none">
          <path d={mirrored(liquidProfile(h), unit)} fill="url(#r1-liquid)" />
          <ellipse
            cx={0}
            cy={-h * unit}
            rx={surfaceR}
            ry={Math.max(1.6, surfaceR * 0.17)}
            fill="#b8e0f0"
            stroke="#6fa9c4"
            strokeWidth={0.9}
          />
          <path
            d={`M${-surfaceR * 0.5} ${-h * unit - 1.6} Q0 ${-h * unit - 4} ${surfaceR * 0.5} ${-h * unit - 1.6}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.7}
            strokeWidth={1.1}
          />
        </g>
      )}
      {undissolved && (
        <g aria-hidden="true">
          {[-0.14, 0.04, 0.2].map((fx, i) => (
            <path
              key={i}
              d={`M${fx * unit - 4} ${-3 - i} L${fx * unit - 1} ${-9 - i} L${fx * unit + 4} ${-7 - i} L${fx * unit + 3} ${-3 - i} Z`}
              fill="#ffffff"
              stroke="#c3cdd3"
              strokeWidth={0.7}
            />
          ))}
        </g>
      )}
      <path
        d={mirrored(FLASK_PROFILE, unit)}
        fill="url(#r1-glass-body)"
        stroke={selected ? '#0f9d8a' : GLASS_STROKE}
        strokeWidth={selected ? 2.4 : 1.7}
        strokeLinejoin="round"
      />
      <path
        d={`M${-0.43 * unit} ${-0.18 * unit} Q${-0.52 * unit} ${-0.42 * unit} ${-0.33 * unit} ${-0.66 * unit}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3.4}
        strokeLinecap="round"
        opacity={0.9}
      />
      <line
        x1={-0.06 * unit}
        y1={-1.08 * unit}
        x2={-0.06 * unit}
        y2={-1.94 * unit}
        stroke="#ffffff"
        strokeWidth={1.8}
        opacity={0.85}
      />
      <ellipse
        cx={0}
        cy={-FLASK_MARK_Y * unit}
        rx={markR + 1}
        ry={2.6}
        fill="none"
        stroke={INK}
        strokeWidth={1.4}
      />
      <ellipse cx={0} cy={-top} rx={0.1 * unit} ry={2.4} fill="#f2f9fb" stroke={GLASS_STROKE} />
      {dirty && (
        <g aria-hidden="true" opacity={0.5}>
          <ellipse
            cx={-0.18 * unit}
            cy={-0.32 * unit}
            rx={0.1 * unit}
            ry={0.06 * unit}
            fill="#7d725c"
          />
          <ellipse
            cx={0.14 * unit}
            cy={-0.5 * unit}
            rx={0.07 * unit}
            ry={0.045 * unit}
            fill="#7d725c"
          />
        </g>
      )}
    </g>
  );
}

export function R1WatchGlass({
  hasSolid,
  dirty,
  selected,
}: {
  hasSolid: boolean;
  dirty: boolean;
  selected: boolean;
}) {
  const rim = selected ? '#0f9d8a' : '#3f6576';
  const rimWidth = selected ? 2.8 : 2.2;
  return (
    <g filter="url(#r1-soft-shadow)">
      <ellipse cx={0} cy={4} rx={50} ry={8} fill="url(#r1-base-shadow)" />
      {/* Dish body: a shallow bowl seen in side profile — a wide ellipse, not a thin lens. Base
          sits near y=0 (this item's anchor), extending upward like the other apparatus. */}
      <ellipse
        cx={0}
        cy={-14}
        rx={50}
        ry={20}
        fill="url(#r1-watchglass-dish)"
        stroke={rim}
        strokeWidth={rimWidth}
      />
      <ellipse
        cx={0}
        cy={-20}
        rx={46}
        ry={11}
        fill="none"
        stroke={rim}
        strokeWidth={rimWidth * 0.75}
        opacity={0.8}
      />
      <path
        d="M-34 -16 Q-8 -25 14 -23"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.6}
        opacity={0.9}
      />
      {hasSolid && (
        <g>
          <path
            d="M-22 -10 Q0 -36 22 -10 Q0 -6 -22 -10 Z"
            fill="#ffffff"
            stroke="#b9c3c9"
            strokeWidth={0.8}
          />
          <circle cx={-7} cy={-20} r={1.3} fill="#b9c3c9" />
          <circle cx={5} cy={-25} r={1.1} fill="#b9c3c9" />
          <circle cx={10} cy={-14} r={1.2} fill="#b9c3c9" />
          <circle cx={-2} cy={-13} r={1} fill="#b9c3c9" />
        </g>
      )}
      {dirty && <ellipse cx={-10} cy={-8} rx={14} ry={6} fill="#7d725c" opacity={0.3} />}
    </g>
  );
}

/** Target needle angle per observed pointer state; the caller animates toward this with `useSettleValue`. */
export const NEEDLE_ANGLE: Record<PointerState, number> = { below: -11, at: 0, above: 11 };

export function R1Balance({
  pointer,
  angle,
  reading,
  selected,
}: {
  pointer: PointerState | null;
  /** Already-animated needle angle in degrees (see `useSettleValue`); this component only draws it. */
  angle: number;
  /** Displayed readout text (already formatted/translated by the caller). */
  reading: string | null;
  selected: boolean;
}) {
  return (
    <g filter="url(#r1-drop-shadow)">
      <ellipse cx={0} cy={6} rx={160} ry={14} fill="url(#r1-base-shadow)" />
      <rect x={-130} y={-28} width={260} height={30} rx={9} fill="url(#r1-metal-dark)" />
      <rect
        x={-130}
        y={-28}
        width={260}
        height={30}
        rx={9}
        fill="none"
        stroke={selected ? '#0f9d8a' : '#20282e'}
        strokeWidth={selected ? 2.4 : 1}
      />
      {[-118, 104].map((x) => (
        <circle key={x} cx={x} cy={-13} r={2.6} fill="#8a959d" />
      ))}
      <rect
        x={-40}
        y={-92}
        width={162}
        height={60}
        rx={8}
        fill="url(#r1-metal)"
        stroke="#5b6670"
        strokeWidth={1.8}
      />
      {/* Arm connecting the weighing-pan column to the beam housing, so the instrument reads as
          one connected object rather than disjoint pieces. */}
      <rect
        x={-78}
        y={-78}
        width={42}
        height={8}
        rx={3}
        fill="url(#r1-metal)"
        stroke="#5b6670"
        strokeWidth={1.4}
      />
      {[-82, -70, -58, -46].map((y) => (
        <g key={y}>
          <line
            x1={-32}
            y1={y}
            x2={112}
            y2={y}
            stroke="#5b6670"
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          {Array.from({ length: 11 }, (_, i) => (
            <line
              key={i}
              x1={-22 + i * 13}
              y1={y - 3.4}
              x2={-22 + i * 13}
              y2={y + 3.4}
              stroke="#8a959d"
              strokeWidth={0.8}
            />
          ))}
          <path
            d={`M-30 ${y - 5.5} L-20 ${y - 5.5} L-22 ${y + 2.5} L-28 ${y + 2.5} Z`}
            fill="#c2862f"
            stroke="#8f5e18"
            strokeWidth={0.4}
          />
        </g>
      ))}
      <rect
        x={-84}
        y={-108}
        width={9}
        height={76}
        fill="url(#r1-metal)"
        stroke="#5b6670"
        strokeWidth={0.8}
      />
      <ellipse
        cx={-79.5}
        cy={-110}
        rx={52}
        ry={7.5}
        fill="url(#r1-metal)"
        stroke="#5b6670"
        strokeWidth={1.4}
      />
      <ellipse cx={-79.5} cy={-110} rx={30} ry={4.4} fill="#ffffff" opacity={0.35} />
      <rect
        x={126}
        y={-98}
        width={9}
        height={66}
        rx={2}
        fill="url(#r1-metal)"
        stroke="#5b6670"
        strokeWidth={0.8}
      />
      <rect x={135} y={-92} width={46} height={40} rx={4} fill="url(#r1-lcd)" stroke="#0a110e" />
      <line x1={140} y1={-67} x2={176} y2={-67} stroke="#49c98f" strokeWidth={1.1} opacity={0.6} />
      <text
        x={158}
        y={-59}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={13}
        fontWeight={700}
        fill={reading ? '#5be9ad' : '#2f4a3c'}
      >
        {reading ?? '0.00'}
      </text>
      <g
        filter={pointer ? 'url(#r1-glow)' : undefined}
        transform={`translate(134 -68) rotate(${angle})`}
      >
        <line
          x1={0}
          y1={0}
          x2={34}
          y2={0}
          stroke={pointer ? '#0f9d8a' : '#9aa9b3'}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </g>
      <line x1={134} y1={-68} x2={110} y2={-68} stroke={INK} strokeWidth={1.2} opacity={0.5} />
    </g>
  );
}
