import type { Locale } from '@vlab/contracts';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatQuantity } from '../../lib/format';
import { FLASK_MARK_Y } from '../flaskProfile';
import { BENCH_TARGET } from '../interaction/gestures';
import { LAB_ITEM_ATTRIBUTE, type LabRendererProps } from '../labRenderer';
import { placementOf, type Placement, type SceneModel } from '../sceneModel';
import { ApparatusDrawing } from './Apparatus2D';
import {
  BENCH_BACK_Y,
  BENCH_Y,
  FLASK_UNIT,
  NARROW_PANEL_PX,
  OVERVIEW,
  SHELF_Y,
  VIEW_H,
  VIEW_W,
  clampView,
  focusView,
  itemBox,
  itemPosition,
  narrowOverview,
  zoomView,
  type ViewBox,
} from './layout2d';

type Preset = 'overview' | 'balance' | 'flask' | 'custom';

/** Items drawn on top of other items come last so they stay visible and clickable. */
const LAYER: Record<Placement, number> = { shelf: 0, bench: 1, on_balance: 2, on_flask: 2 };

/**
 * How far the room is drawn beyond the base frame on each side. The view box widens to the
 * panel's shape (see `stageAspect`), so the wall, tiles and bench must keep going rather than
 * stopping at `VIEW_W` and leaving blank bands.
 */
const BLEED = 700;
const BLEED_W = VIEW_W + BLEED * 2;

function Backdrop({ shelfLabel }: { shelfLabel: string }) {
  return (
    <g aria-hidden="true">
      <rect
        x={-BLEED}
        y={-BLEED}
        width={BLEED_W}
        height={VIEW_H + BLEED * 2}
        fill="url(#lab2d-wall)"
      />
      <rect
        x={-BLEED}
        y={SHELF_Y + 40}
        width={BLEED_W}
        height={BENCH_BACK_Y - SHELF_Y - 40}
        fill="url(#lab2d-tiles)"
      />
      <g className="lab2d-window">
        <rect
          x={1168}
          y={24}
          width={96}
          height={150}
          rx={6}
          fill="#cfe6f1"
          stroke="#b7c6cf"
          strokeWidth={4}
        />
        <line x1={1216} y1={24} x2={1216} y2={174} stroke="#b7c6cf" strokeWidth={3} />
        <line x1={1168} y1={99} x2={1264} y2={99} stroke="#b7c6cf" strokeWidth={3} />
        <path
          d="M1176 44 L1200 30 M1176 68 L1204 54"
          stroke="#ffffff"
          strokeWidth={3}
          opacity={0.7}
        />
      </g>
      <rect x={-BLEED} y={SHELF_Y} width={BLEED_W} height={12} rx={2} fill="#b8c3ca" />
      <rect x={-BLEED} y={SHELF_Y + 12} width={BLEED_W} height={6} fill="#8d9aa3" />
      {[90, 600, 1100].map((x) => (
        <path key={x} d={`M${x} ${SHELF_Y + 18} l0 26 l22 -26 Z`} fill="#8d9aa3" />
      ))}
      <g className="lab2d-plaque">
        <rect
          x={44}
          y={18}
          width={Math.max(150, shelfLabel.length * 8.4 + 28)}
          height={30}
          rx={15}
          fill="#ffffff"
          stroke="#d6e0e6"
        />
        <text x={58} y={38} fontSize={15} fontWeight={600} fill="#2f414d">
          {shelfLabel}
        </text>
      </g>
      <rect x={-BLEED} y={BENCH_BACK_Y - 8} width={BLEED_W} height={8} fill="#8796a1" />
      <rect
        x={-BLEED}
        y={BENCH_BACK_Y}
        width={BLEED_W}
        height={BENCH_Y - BENCH_BACK_Y}
        fill="url(#lab2d-bench)"
      />
      {/* Depth cues on the worktop: shading under the back panel, then a lit front lip. Both are
          presentation only — they draw no apparatus and depend on no session state. */}
      <rect x={-BLEED} y={BENCH_BACK_Y} width={BLEED_W} height={26} fill="url(#lab2d-bench-ao)" />
      <rect x={-BLEED} y={BENCH_Y - 10} width={BLEED_W} height={10} fill="url(#lab2d-bench-lip)" />
      <rect x={-BLEED} y={BENCH_Y} width={BLEED_W} height={4} fill="#9aa9b3" />
      <rect
        x={-BLEED}
        y={BENCH_Y + 4}
        width={BLEED_W}
        height={VIEW_H - BENCH_Y - 4 + BLEED}
        fill="#3f4b54"
      />
    </g>
  );
}

/**
 * Illustrated 2D laboratory (SVG, no WebGL). Items are keyboard-focusable buttons; activating one
 * calls the shared `onPick` selection handler. Zoom changes only the SVG view box.
 */
interface Drag {
  id: string;
  x: number;
  y: number;
  moved: boolean;
}

/** Pointer travel (px) after which a press becomes a drag. */
const DRAG_START = 8;

export default function Laboratory2D({
  model,
  onPick,
  label,
  heldItemId = null,
  onDrop,
}: LabRendererProps) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'si' ? 'si' : 'en') as Locale;
  const [view, setView] = useState<ViewBox>(OVERVIEW);
  const [preset, setPreset] = useState<Preset>('overview');
  const svgRef = useRef<SVGSVGElement>(null);
  /**
   * Aspect ratio of the panel the stage is actually given. The drawing widens its view box to
   * match, so the laboratory fills the panel edge to edge instead of being letterboxed inside it
   * with empty bands at the sides — the drawing simply shows more bench and wall when the panel
   * is wider than the base frame. 0 means "not measured yet"; the base frame is used until then.
   */
  const [stageAspect, setStageAspect] = useState(0);
  /** Panel width in CSS pixels, used to pick a readable overview framing on a phone. */
  const [stageWidth, setStageWidth] = useState(0);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setStageAspect(width / height);
        setStageWidth(width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Client (screen) coordinates to drawing coordinates. */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(matrix.inverse());
  };
  const onItemPointerDown = (id: string) => (e: PointerEvent<SVGGElement>) => {
    if (!onDrop || e.button !== 0) return;
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START) return;
    d.moved = true;
    const p = toSvg(e.clientX, e.clientY);
    if (p) setGhost({ id: d.id, x: p.x, y: p.y });
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d?.moved || !onDrop) return;
    // Ignore the click the browser fires right after this pointer-up (only that one).
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const hit = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(`[${LAB_ITEM_ATTRIBUTE}]`)
      ?.getAttribute(LAB_ITEM_ATTRIBUTE);
    if (hit && hit !== d.id) return onDrop(d.id, hit);
    const p = toSvg(e.clientX, e.clientY);
    if (p && p.y >= BENCH_BACK_Y && p.y <= BENCH_Y) onDrop(d.id, BENCH_TARGET);
  };
  const click = (id: string) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onPick(id);
  };

  const balance = model.items.find((i) => i.kind === 'balance');
  const flask =
    model.items.find((i) => i.id === model.workingFlaskId) ??
    model.items.find((i) => i.kind === 'volumetric_flask');

  const goTo = (next: Preset) => {
    setPreset(next);
    if (next === 'overview' || !balance || !flask) return setView(OVERVIEW);
    if (next === 'balance') return setView(focusView(balance, model, 560));
    const base = itemPosition(flask, model);
    const markY = base.y - FLASK_MARK_Y * FLASK_UNIT * flask.scale * base.s;
    setView(clampView({ x: base.x - 210, y: markY - 118, w: 420, h: 0 }));
  };
  const zoom = (factor: number) => {
    setPreset('custom');
    setView((v) => zoomView(v, factor));
  };

  const formatLabel = (l: NonNullable<SceneModel['label']>): string[] =>
    [
      l.solutionName.slice(0, 22),
      l.concentration ? formatQuantity(l.concentration, locale) : '',
      l.preparationDate ?? '',
    ].filter(Boolean);

  const workingFlask = model.items.find((i) => i.id === model.workingFlaskId);
  const spillAt = model.spilled && workingFlask ? itemPosition(workingFlask, model) : null;

  const ordered = model.items
    .map((item) => ({ item, placement: placementOf(item, model) }))
    .sort((a, b) => LAYER[a.placement] - LAYER[b.placement]);

  const keyPick = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(id);
    }
  };

  const presetButton = (id: Exclude<Preset, 'custom'>, key: string) => (
    <button
      type="button"
      className="lab-toolbar__button"
      aria-pressed={preset === id}
      onClick={() => goTo(id)}
    >
      {t(key)}
    </button>
  );

  return (
    <div className="lab2d" data-renderer="2d">
      <div className="lab-toolbar" role="toolbar" aria-label={t('ui.lab.view_controls')}>
        {presetButton('overview', 'ui.lab.view.overview')}
        {presetButton('balance', 'ui.lab.view.balance')}
        {presetButton('flask', 'ui.lab.view.mark')}
      </div>
      <svg
        ref={svgRef}
        className={ghost ? 'lab2d__svg lab2d__svg--dragging' : 'lab2d__svg'}
        viewBox={(() => {
          // Grow (never crop) the current view to the panel's shape, keeping it centred, so the
          // drawing fills the panel rather than sitting letterboxed inside it. A panel wider than
          // the frame reveals more bench and wall to the sides; a taller one reveals more above
          // and below. The backdrop is drawn well past the frame (`BLEED`) to cover both.
          // On a phone the untouched overview draws the whole room into ~360px and the apparatus
          // become unidentifiable, so the overview preset starts from a tighter frame there. Only
          // the overview is substituted: once the student zooms or pans the preset is 'custom'
          // and their own framing is respected.
          const base =
            preset === 'overview' && stageWidth > 0 && stageWidth < NARROW_PANEL_PX
              ? narrowOverview()
              : view;
          if (stageAspect <= 0) return `${base.x} ${base.y} ${base.w} ${base.h}`;
          if (base.w / base.h < stageAspect) {
            const w = base.h * stageAspect;
            return `${base.x - (w - base.w) / 2} ${base.y} ${w} ${base.h}`;
          }
          const h = base.w / stageAspect;
          return `${base.x} ${base.y - (h - base.h) / 2} ${base.w} ${h}`;
        })()}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={label}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          drag.current = null;
          setGhost(null);
        }}
      >
        <Backdrop shelfLabel={t('ui.lab.shelf')} />
        <rect
          className="lab2d-bench-target"
          x={-BLEED}
          y={BENCH_BACK_Y}
          width={BLEED_W}
          height={BENCH_Y - BENCH_BACK_Y}
          onClick={() => onPick(BENCH_TARGET)}
        />
        {ordered.map(({ item, placement }) => {
          const p = itemPosition(item, model);
          const box = itemBox(item, placement);
          const name = t(item.nameKey);
          const status = [
            t(`ui.lab.placement.${placement}`),
            item.cleanliness === 'clean'
              ? t('ui.equipment.cleaned')
              : item.cleanliness === 'dirty'
                ? t('ui.equipment.not_cleaned')
                : null,
          ]
            .filter(Boolean)
            .join(', ');
          const tagWidth = Math.min(300, name.length * 7.4 + 24);
          return (
            <g
              key={item.id}
              className={[
                'lab2d-item',
                item.highlighted ? 'lab2d-item--selected' : '',
                heldItemId === item.id ? 'lab2d-item--held' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              transform={`translate(${p.x} ${p.y}) scale(${p.s})`}
              role="button"
              tabIndex={0}
              aria-pressed={item.highlighted}
              aria-label={`${name}, ${status}`}
              data-lab-item={item.id}
              data-placement={placement}
              data-selected={item.highlighted}
              onClick={click(item.id)}
              onKeyDown={keyPick(item.id)}
              onPointerDown={onItemPointerDown(item.id)}
            >
              <title>{name}</title>
              {placement !== 'on_balance' && placement !== 'on_flask' && (
                <ellipse className="lab2d-item__shadow" cx={0} cy={1} rx={box.w * 0.46} ry={5} />
              )}
              <rect
                className="lab2d-item__ring"
                x={-box.w / 2 - 8}
                y={-box.h - 8}
                width={box.w + 16}
                height={box.h + 14}
                rx={12}
              />
              <ApparatusDrawing
                item={item}
                model={model}
                placement={placement}
                formatLabel={formatLabel}
              />
              {/* Items resting on another item keep their ring; one tag avoids overlapping labels. */}
              {item.highlighted && placement !== 'on_balance' && placement !== 'on_flask' && (
                <g
                  className="lab2d-tag"
                  transform={`translate(0 ${-box.h - 22 / p.s}) scale(${1 / p.s})`}
                >
                  <rect x={-tagWidth / 2} y={-15} width={tagWidth} height={24} rx={12} />
                  <text x={0} y={2} textAnchor="middle" fontSize={13} fontWeight={600}>
                    {name}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {ghost &&
          (() => {
            const item = model.items.find((i) => i.id === ghost.id);
            if (!item) return null;
            const placement = placementOf(item, model);
            const s = itemPosition(item, model).s;
            return (
              <g
                className="lab2d-ghost"
                transform={`translate(${ghost.x} ${ghost.y + (itemBox(item, placement).h * s) / 2}) scale(${s})`}
                aria-hidden="true"
              >
                <ApparatusDrawing
                  item={item}
                  model={model}
                  placement={placement}
                  formatLabel={formatLabel}
                />
              </g>
            );
          })()}
        {spillAt && (
          <g className="lab2d-spill" aria-hidden="true">
            {[-34, -18, -6, 9, 22, 37].map((dx, i) => (
              <circle key={i} cx={spillAt.x + dx + 60} cy={spillAt.y + 4 + (i % 2) * 4} r={2.6} />
            ))}
          </g>
        )}
      </svg>
      <div className="lab-zoom" role="group" aria-label={t('ui.lab.zoom_controls')}>
        <button
          type="button"
          className="lab-zoom__button"
          aria-label={t('ui.lab.zoom_in')}
          title={t('ui.lab.zoom_in')}
          onClick={() => zoom(0.8)}
          disabled={view.w <= 361}
        >
          +
        </button>
        <button
          type="button"
          className="lab-zoom__button"
          aria-label={t('ui.lab.zoom_out')}
          title={t('ui.lab.zoom_out')}
          onClick={() => zoom(1.25)}
          disabled={view.w >= VIEW_W}
        >
          −
        </button>
      </div>
    </div>
  );
}
