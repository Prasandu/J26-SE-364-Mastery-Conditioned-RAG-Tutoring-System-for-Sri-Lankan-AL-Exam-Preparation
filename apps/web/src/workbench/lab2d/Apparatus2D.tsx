import { useId } from 'react';
import {
  FLASK_MARK_Y,
  FLASK_PROFILE,
  flaskRadiusAt,
  liquidHeight,
  liquidProfile,
} from '../flaskProfile';
import type { Placement, PointerState, SceneItem, SceneModel } from '../sceneModel';
import { useSettleValue } from '../useSettleValue';
import { FLASK_HEIGHT, FLASK_UNIT } from './layout2d';

/**
 * Original illustrated apparatus for the 2D laboratory. Each drawing has its origin at the base
 * centre and extends upwards (negative y). Visual state comes only from the scene model.
 */

const INK = '#2f414d';
const GLASS_STROKE = '#5f7f90';
const SOLID = '#ffffff';
const SOLID_EDGE = '#b9c3c9';

const mirrored = (pts: readonly (readonly [number, number])[], s: number): string => {
  const right = pts.map(([r, y]) => `${(r * s).toFixed(1)} ${(-y * s).toFixed(1)}`);
  const left = [...pts].reverse().map(([r, y]) => `${(-r * s).toFixed(1)} ${(-y * s).toFixed(1)}`);
  return `M${right.join(' L')} L${left.join(' L')} Z`;
};

function Smudges({ cx, cy, spread }: { cx: number; cy: number; spread: number }) {
  return (
    <g className="lab2d-smudges" aria-hidden="true">
      <ellipse cx={cx - spread * 0.4} cy={cy} rx={spread * 0.22} ry={spread * 0.12} />
      <ellipse cx={cx + spread * 0.3} cy={cy - spread * 0.3} rx={spread * 0.16} ry={spread * 0.1} />
      <ellipse
        cx={cx + spread * 0.05}
        cy={cy + spread * 0.32}
        rx={spread * 0.12}
        ry={spread * 0.08}
      />
    </g>
  );
}

/**
 * Undissolved solid, faded in and out rather than popped.
 *
 * `useSettleValue` eases toward the target opacity and collapses to it instantly under
 * `prefers-reduced-motion`, so the settled picture is identical either way. The group stays
 * mounted at zero opacity so there is no layout change to animate against.
 */
function DissolvingSolid({ visible, width, y }: { visible: boolean; width: number; y: number }) {
  const opacity = useSettleValue(visible ? 1 : 0, 520);
  if (opacity <= 0.01) return null;
  return (
    <g opacity={opacity}>
      <Crystals width={width} y={y} />
    </g>
  );
}

function Crystals({ width, y }: { width: number; y: number }) {
  const xs = [-0.42, -0.2, 0.02, 0.22, 0.4, -0.3, 0.12];
  return (
    <g className="lab2d-crystals" aria-hidden="true">
      {xs.map((fx, i) => {
        const x = fx * width;
        const yy = y - (i > 4 ? 6 : 0);
        return (
          <path
            key={i}
            d={`M${x - 4} ${yy} L${x - 1} ${yy - 6} L${x + 4} ${yy - 4} L${x + 3} ${yy} Z`}
            fill={SOLID}
            stroke={SOLID_EDGE}
            strokeWidth={0.8}
          />
        );
      })}
    </g>
  );
}

export function Flask2D({
  item,
  model,
  formatLabel,
}: {
  item: SceneItem;
  model: SceneModel;
  formatLabel: (label: NonNullable<SceneModel['label']>) => string[];
}) {
  const s = FLASK_UNIT * item.scale;
  const working = model.workingFlaskId === item.id;
  const level = working ? model.liquidLevel : 0;
  // Only ever changes once the engine has confirmed a new `liquidLevel` in the projection — there
  // is no earlier, unconfirmed value for this to ease from, so a rejected action never animates.
  const animatedLevel = useSettleValue(level, 550);
  const h = liquidHeight(animatedLevel);
  const surfaceR = Math.max(0.005, flaskRadiusAt(h) - 0.02) * s;
  const markR = flaskRadiusAt(FLASK_MARK_Y) * s;
  const top = FLASK_HEIGHT * s;
  const clipId = `lab2d-flask-clip-${useId().replace(/:/g, '')}`;
  const labelLines = working && model.label ? formatLabel(model.label) : [];
  return (
    <g filter="url(#lab2d-drop-shadow)">
      <defs>
        <clipPath id={clipId}>
          <path d={mirrored(FLASK_PROFILE, s)} />
        </clipPath>
      </defs>
      <ellipse
        cx={0}
        cy={4}
        rx={0.5 * s}
        ry={Math.max(6, 0.06 * s)}
        fill="url(#lab2d-base-shadow)"
      />
      <path d={mirrored(FLASK_PROFILE, s)} fill="url(#lab2d-glass)" />
      {h > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <path d={mirrored(liquidProfile(h), s)} fill="url(#lab2d-liquid)" />
          <ellipse
            cx={0}
            cy={-h * s}
            rx={surfaceR}
            ry={Math.max(1.4, surfaceR * 0.16)}
            fill="#a9d3e6"
            stroke="#6fa9c4"
            strokeWidth={0.8}
          />
        </g>
      )}
      {/* Solid appearing in the flask (transfer) and clearing from it (dissolving) are the two
          steps a student otherwise only reads about. Both are driven by `undissolvedVisible`, an
          engine observation, so a rejected transfer or a failed dissolve animates nothing; the
          fade only ever follows a confirmed change. */}
      {working && <DissolvingSolid visible={model.undissolvedVisible} width={0.5 * s} y={-3} />}
      <path
        d={mirrored(FLASK_PROFILE, s)}
        fill="none"
        stroke={GLASS_STROKE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path
        d={`M${-0.42 * s} ${-0.2 * s} Q${-0.5 * s} ${-0.4 * s} ${-0.34 * s} ${-0.62 * s}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.85}
      />
      <line
        x1={-0.05 * s}
        y1={-1.1 * s}
        x2={-0.05 * s}
        y2={-1.9 * s}
        stroke="#ffffff"
        strokeWidth={1.6}
        opacity={0.8}
      />
      <ellipse
        className="lab2d-mark"
        cx={0}
        cy={-FLASK_MARK_Y * s}
        rx={markR + 1}
        ry={2.4}
        fill="none"
        stroke={INK}
        strokeWidth={1.3}
      />
      <ellipse cx={0} cy={-top} rx={0.1 * s} ry={2.2} fill="#eef6f9" stroke={GLASS_STROKE} />
      {item.cleanliness === 'dirty' && <Smudges cx={0} cy={-0.3 * s} spread={0.5 * s} />}
      {labelLines.length > 0 && (
        <g className="lab2d-label">
          <rect
            x={-0.32 * s}
            y={-0.56 * s}
            width={0.64 * s}
            height={0.3 * s}
            rx={3}
            fill="#fffdf5"
            stroke="#c9bfa5"
          />
          {labelLines.map((line, i) => (
            <text
              key={i}
              x={0}
              y={-0.56 * s + 0.09 * s * (i + 1)}
              textAnchor="middle"
              fontSize={Math.max(6.5, 0.068 * s)}
              fill={INK}
            >
              {line}
            </text>
          ))}
        </g>
      )}
      {working && model.stoppered && (
        <rect
          x={-0.13 * s}
          y={-top - 0.14 * s}
          width={0.26 * s}
          height={0.16 * s}
          rx={3}
          fill="#3b4650"
        />
      )}
      {working && model.warning && (
        <g className="lab2d-warning" transform={`translate(${0.42 * s} ${-1.5 * s})`}>
          <path d="M0 -14 L12 8 L-12 8 Z" fill="#e09f3e" stroke="#995605" />
          <text x={0} y={5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#3b2406">
            !
          </text>
        </g>
      )}
    </g>
  );
}

export function WatchGlass2D({ hasSolid, dirty }: { hasSolid: boolean; dirty: boolean }) {
  return (
    <g filter="url(#lab2d-soft-shadow)">
      <ellipse cx={0} cy={4} rx={46} ry={7} fill="url(#lab2d-base-shadow)" />
      {/* A shallow dish seen in side profile (a wide ellipse), not a thin lens — the dish's own
          base sits near y=0, in line with every other apparatus drawn on this baseline. */}
      <ellipse
        cx={0}
        cy={-13}
        rx={46}
        ry={18}
        fill="url(#lab2d-glass)"
        stroke="#3f6576"
        strokeWidth={2.2}
      />
      <ellipse
        cx={0}
        cy={-18}
        rx={42}
        ry={10}
        fill="none"
        stroke="#3f6576"
        strokeWidth={1.4}
        opacity={0.75}
      />
      <path
        d="M-30 -15 Q-10 -23 8 -21"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.2}
        opacity={0.9}
      />
      {hasSolid && (
        <g className="lab2d-solid">
          <path d="M-22 -9 Q0 -34 22 -9 Q0 -5 -22 -9 Z" fill={SOLID} stroke={SOLID_EDGE} />
          <circle cx={-6} cy={-17} r={1.2} fill={SOLID_EDGE} />
          <circle cx={5} cy={-21} r={1} fill={SOLID_EDGE} />
          <circle cx={9} cy={-13} r={1.1} fill={SOLID_EDGE} />
        </g>
      )}
      {dirty && <Smudges cx={0} cy={-10} spread={30} />}
    </g>
  );
}

export function Funnel2D({ placement, dirty }: { placement: Placement; dirty: boolean }) {
  const standing = placement !== 'on_flask';
  return (
    <g filter="url(#lab2d-soft-shadow)">
      {standing && (
        <g className="lab2d-stand">
          <ellipse cx={0} cy={0} rx={28} ry={5} fill="url(#lab2d-base-shadow)" />
          <rect
            x={-26}
            y={-5}
            width={52}
            height={5}
            rx={2}
            fill="url(#lab2d-metal)"
            stroke="#5b6670"
            strokeWidth={0.8}
          />
          <rect x={-2} y={-62} width={4} height={58} fill="url(#lab2d-metal)" />
          <ellipse cx={0} cy={-62} rx={18} ry={3} fill="none" stroke="#7d8a93" strokeWidth={2.5} />
        </g>
      )}
      <path
        d="M-36 -90 L36 -90 L6 -50 L4 -10 L-4 -10 L-6 -50 Z"
        fill="url(#lab2d-glass)"
        stroke={GLASS_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
        transform={standing ? undefined : 'translate(0 10)'}
      />
      <ellipse
        cx={0}
        cy={standing ? -90 : -80}
        rx={36}
        ry={4}
        fill="#eef6f9"
        stroke={GLASS_STROKE}
      />
      {dirty && <Smudges cx={0} cy={standing ? -72 : -62} spread={26} />}
    </g>
  );
}

export function Beaker2D({ dirty }: { dirty: boolean }) {
  return (
    <g filter="url(#lab2d-soft-shadow)">
      <ellipse cx={0} cy={2} rx={32} ry={6} fill="url(#lab2d-base-shadow)" />
      <path
        d="M-32 -82 L-38 -86 L-30 -84 L-30 -6 Q-30 0 -24 0 L24 0 Q30 0 30 -6 L30 -84 Z"
        fill="url(#lab2d-glass)"
        stroke={GLASS_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {[20, 34, 48, 62].map((y) => (
        <line key={y} x1={14} y1={-y} x2={24} y2={-y} stroke={INK} strokeWidth={1} opacity={0.6} />
      ))}
      <line x1={-20} y1={-12} x2={-20} y2={-70} stroke="#ffffff" strokeWidth={2.4} opacity={0.85} />
      {dirty && <Smudges cx={0} cy={-36} spread={28} />}
    </g>
  );
}

export function WashBottle2D() {
  return (
    <g filter="url(#lab2d-soft-shadow)">
      <ellipse cx={0} cy={2} rx={28} ry={6} fill="url(#lab2d-base-shadow)" />
      {/* Plastic, not glass: a flatter, less transmissive gradient than the glassware's. */}
      <path
        d="M-26 -78 Q-28 -88 -12 -90 L12 -90 Q28 -88 26 -78 L26 -8 Q26 0 18 0 L-18 0 Q-26 0 -26 -8 Z"
        fill="url(#lab2d-plastic)"
        stroke="#8aa2ae"
        strokeWidth={1.5}
      />
      <path d="M-24 -50 L24 -50 L24 -8 Q24 -2 18 -2 L-18 -2 Q-24 -2 -24 -8 Z" fill="#d5ebf5" />
      <path
        d="M-20 -72 L-14 -56"
        stroke="#ffffff"
        strokeWidth={2.2}
        opacity={0.75}
        strokeLinecap="round"
      />
      <rect x={-10} y={-100} width={20} height={11} rx={2} fill="#2f6f8f" />
      <path
        d="M0 -100 L0 -114 Q0 -120 8 -118 L36 -105 L40 -94"
        fill="none"
        stroke="#8aa2ae"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>
  );
}

export function Dropper2D({ standing }: { standing: boolean }) {
  return (
    <g filter="url(#lab2d-soft-shadow)" transform={standing ? 'rotate(-90)' : undefined}>
      <path
        d="M-52 -9 L-40 -11 L30 -11 L30 -5 L-40 -5 Z"
        fill="url(#lab2d-glass)"
        stroke={GLASS_STROKE}
      />
      <line x1={-36} y1={-9.5} x2={20} y2={-9.5} stroke="#ffffff" strokeWidth={1} opacity={0.8} />
      {/* Rubber bulb: matte, not glass. */}
      <ellipse cx={40} cy={-8} rx={12} ry={7} fill="#3b4650" />
      <ellipse cx={37} cy={-10.5} rx={3.5} ry={1.6} fill="#5c6a76" opacity={0.8} />
    </g>
  );
}

export function Reagent2D({ formula }: { formula: string | null }) {
  return (
    <g filter="url(#lab2d-drop-shadow)">
      <ellipse cx={0} cy={2} rx={32} ry={6} fill="url(#lab2d-base-shadow)" />
      {/* An opaque reagent container (plastic, not glass): a flatter gradient than the glassware. */}
      <rect
        x={-30}
        y={-78}
        width={60}
        height={78}
        rx={7}
        fill="url(#lab2d-plastic)"
        stroke="#8ba2ae"
        strokeWidth={1.4}
      />
      <rect x={-27} y={-92} width={54} height={15} rx={3} fill="url(#lab2d-metal-dark)" />
      <rect x={-24} y={-60} width={48} height={30} rx={3} fill="#ffffff" stroke="#c9bfa5" />
      {formula && (
        <text x={0} y={-40} textAnchor="middle" fontSize={13} fontWeight={700} fill={INK}>
          {formula}
        </text>
      )}
    </g>
  );
}

const NEEDLE_DY: Record<PointerState, number> = { below: 9, at: 0, above: -9 };

export function Balance2D({ pointer }: { pointer: PointerState | null }) {
  const target = pointer ? NEEDLE_DY[pointer] : 0;
  // Only moves once the engine has confirmed a pointer observation; a rejected weighing attempt
  // leaves `pointer` (and so the needle) exactly where it was.
  const dy = useSettleValue(target, 400);
  return (
    <g filter="url(#lab2d-drop-shadow)">
      <ellipse cx={-7} cy={0} rx={128} ry={10} fill="url(#lab2d-base-shadow)" />
      <rect x={-118} y={-30} width={236} height={26} rx={8} fill="url(#lab2d-metal-dark)" />
      <rect x={-112} y={-6} width={16} height={6} rx={2} fill="#2b3339" />
      <rect x={96} y={-6} width={16} height={6} rx={2} fill="#2b3339" />
      {/* Arm connecting the pan column to the beam housing, so the instrument reads as one
          connected object rather than disjoint pieces. */}
      <rect
        x={-70}
        y={-72}
        width={38}
        height={7}
        rx={3}
        fill="url(#lab2d-metal)"
        stroke="#5b6670"
        strokeWidth={1.2}
      />
      <rect
        x={-34}
        y={-86}
        width={150}
        height={56}
        rx={7}
        fill="url(#lab2d-metal)"
        stroke="#5b6670"
        strokeWidth={1.6}
      />
      {[-74, -63, -52, -41].map((y) => (
        <g key={y}>
          <line
            x1={-28}
            y1={y}
            x2={104}
            y2={y}
            stroke="#5b6670"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {Array.from({ length: 10 }, (_, i) => (
            <line
              key={i}
              x1={-20 + i * 13}
              y1={y - 3}
              x2={-20 + i * 13}
              y2={y + 3}
              stroke="#7b8790"
              strokeWidth={0.8}
            />
          ))}
          <path d={`M-26 ${y - 5} L-18 ${y - 5} L-20 ${y + 2} L-24 ${y + 2} Z`} fill="#c2862f" />
        </g>
      ))}
      <rect
        x={-76}
        y={-100}
        width={8}
        height={70}
        fill="url(#lab2d-metal)"
        stroke="#5b6670"
        strokeWidth={0.8}
      />
      <ellipse
        cx={-72}
        cy={-102}
        rx={48}
        ry={7}
        fill="url(#lab2d-metal)"
        stroke="#5b6670"
        strokeWidth={1.4}
      />
      <ellipse cx={-72} cy={-102} rx={28} ry={4} fill="#ffffff" opacity={0.35} />
      <rect
        x={116}
        y={-92}
        width={8}
        height={62}
        rx={2}
        fill="url(#lab2d-metal)"
        stroke="#5b6670"
        strokeWidth={0.8}
      />
      <rect x={124} y={-80} width={16} height={34} rx={2} fill="#ffffff" stroke="#8a959d" />
      <line x1={124} y1={-63} x2={140} y2={-63} stroke={INK} strokeWidth={1.2} />
      <text x={132} y={-49} textAnchor="middle" fontSize={8} fill={INK}>
        0
      </text>
      <line
        className={pointer ? 'lab2d-needle lab2d-needle--active' : 'lab2d-needle'}
        x1={104}
        y1={-58}
        x2={138}
        y2={-63 + dy}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </g>
  );
}

/** One apparatus drawing for any scene item (shared by the 2D lab and the equipment tray). */
export function ApparatusDrawing({
  item,
  model,
  placement,
  formatLabel,
}: {
  item: SceneItem;
  model: SceneModel;
  placement: Placement;
  formatLabel: (label: NonNullable<SceneModel['label']>) => string[];
}) {
  const dirty = item.cleanliness === 'dirty';
  switch (item.kind) {
    case 'volumetric_flask':
      return <Flask2D item={item} model={model} formatLabel={formatLabel} />;
    case 'balance':
      return <Balance2D pointer={model.balance.pointer} />;
    case 'watch_glass':
      return <WatchGlass2D hasSolid={model.watchGlassHasSolid} dirty={dirty} />;
    case 'funnel':
      return <Funnel2D placement={placement} dirty={dirty} />;
    case 'beaker':
      return <Beaker2D dirty={dirty} />;
    case 'wash_bottle':
      return <WashBottle2D />;
    case 'dropper':
      return <Dropper2D standing={placement === 'shelf'} />;
    case 'reagent':
      return <Reagent2D formula={model.reagentFormula} />;
  }
}
