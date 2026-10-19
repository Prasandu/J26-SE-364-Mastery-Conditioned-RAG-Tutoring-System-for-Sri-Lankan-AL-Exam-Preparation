import type { Locale } from '@vlab/contracts';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
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
  OVERVIEW,
  SHELF_Y,
  VIEW_H,
  VIEW_W,
  clampView,
  focusView,
  itemBox,
  itemPosition,
  zoomView,
  type ViewBox,
} from './layout2d';

type Preset = 'overview' | 'balance' | 'flask' | 'custom';

/** Items drawn on top of other items come last so they stay visible and clickable. */
const LAYER: Record<Placement, number> = { shelf: 0, bench: 1, on_balance: 2, on_flask: 2 };

function Backdrop({ shelfLabel }: { shelfLabel: string }) {
  return (
    <g aria-hidden="true">
      <rect width={VIEW_W} height={VIEW_H} fill="url(#lab2d-wall)" />
      <rect
        x={0}
        y={SHELF_Y + 40}
        width={VIEW_W}
        height={BENCH_BACK_Y - SHELF_Y - 40}
        fill="url(#lab2d-tiles)"
      />
      <g className="lab2d-window">
        <rect
          x={1168}
          y={36}
          width={96}
          height={214}
          rx={6}
          fill="#cfe6f1"
          stroke="#b7c6cf"
          strokeWidth={4}
        />
        <line x1={1216} y1={36} x2={1216} y2={249} stroke="#b7c6cf" strokeWidth={3} />
        <line x1={1168} y1={142} x2={1264} y2={142} stroke="#b7c6cf" strokeWidth={3} />
        <path
          d="M1176 60 L1206 44 M1176 90 L1210 72"
          stroke="#ffffff"
          strokeWidth={3}
          opacity={0.7}
        />
      </g>
      <rect x={36} y={SHELF_Y} width={1112} height={12} rx={2} fill="#b8c3ca" />
      <rect x={36} y={SHELF_Y + 12} width={1112} height={6} fill="#8d9aa3" />
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
      <rect x={0} y={BENCH_BACK_Y - 8} width={VIEW_W} height={8} fill="#8796a1" />
      <rect
        x={0}
        y={BENCH_BACK_Y}
        width={VIEW_W}
        height={BENCH_Y - BENCH_BACK_Y}
        fill="url(#lab2d-bench)"
      />
      <rect x={0} y={BENCH_Y} width={VIEW_W} height={4} fill="#9aa9b3" />
      <rect x={0} y={BENCH_Y + 4} width={VIEW_W} height={VIEW_H - BENCH_Y - 4} fill="#3f4b54" />
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
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);

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
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
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
          x={0}
          y={BENCH_BACK_Y}
          width={VIEW_W}
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
