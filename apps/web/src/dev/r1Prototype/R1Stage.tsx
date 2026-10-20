import type { Locale } from '@vlab/contracts';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatQuantity } from '../../lib/format';
import { useSettleValue } from '../../workbench/useSettleValue';
import { NEEDLE_ANGLE, R1Balance, R1Defs, R1Flask, R1WatchGlass } from './R1Apparatus';
import { useR1Session } from './useR1Session';

/**
 * R1 proof-of-quality prototype stage (chemistry-lab-advanced-sim-r1). One bench vignette: the
 * `volumetric_flask_250` apparatus, a watch glass and a four-beam balance, driven by the real
 * engine session from `useR1Session`. Isolated from the production `LaboratoryViewport` — this never
 * replaces it; it exists so the new illustration/animation approach can be compared against it.
 */

const VIEW_W = 820;
const VIEW_H = 360;
/** One bench row: a "shelf" item sits smaller and further back, a "bench" item sits full-size at
 * the front. Both states share the same compact frame (no separate, mostly-empty shelf tier). */
const WALL_BENCH_LINE = 150;
const SHELF_Y = 192;
const BENCH_Y = 288;
const SHELF_SCALE = 0.72;

type Pos = { shelf: [number, number]; bench: [number, number] };
const atX = (x: number): Pos => ({ shelf: [x, SHELF_Y], bench: [x, BENCH_Y] });
const POSITION: Record<string, Pos> = {
  four_beam_balance: atX(220),
  watch_glass: atX(420),
  volumetric_flask_250: atX(620),
};
/** Offset of the balance pan relative to the balance's own origin, in this stage's coordinates. */
const PAN_OFFSET: [number, number] = [-66, -78];

export function R1Stage() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'si' ? 'si' : 'en') as Locale;
  const { model, phase, lastEvent, dispatch, setFocusedItem, focusedItem } = useR1Session();
  const [zoom, setZoom] = useState<1 | 0.8 | 1.25>(1);

  const measurement = model?.balance.watchGlassReading ?? null;
  const needleTarget = model?.balance.pointer ? NEEDLE_ANGLE[model.balance.pointer] : 0;
  const animatedAngle = useSettleValue(needleTarget);
  const readingTarget = measurement ? Number(measurement.value.toFixed(2)) : 0;
  const animatedReading = useSettleValue(readingTarget);

  if (!model) return <p className="r1-loading">Starting the prototype session…</p>;

  const balance = model.items.find((i) => i.id === 'four_beam_balance')!;
  const flask = model.items.find((i) => i.id === 'volumetric_flask_250')!;
  const watchGlass = model.items.find((i) => i.id === 'watch_glass')!;
  const onBalance = model.watchGlassOnBalance;

  const posOf = (id: string, onBench: boolean) =>
    onBench ? POSITION[id]!.bench : POSITION[id]!.shelf;
  const watchGlassPos: [number, number] = onBalance
    ? [
        POSITION.four_beam_balance!.bench[0] + PAN_OFFSET[0],
        POSITION.four_beam_balance!.bench[1] + PAN_OFFSET[1],
      ]
    : posOf('watch_glass', watchGlass.onBench);

  const selectToBench = (id: string) =>
    void dispatch({ type: 'select_apparatus', apparatusIds: [id] });
  const weigh = () => void dispatch({ type: 'weigh_watch_glass' });

  const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const inspectorFor = (id: string, name: string, onBench: boolean, dirty: boolean) => (
    <aside className="r1-inspector" role="region" aria-label={`${name} inspector`}>
      <h3>{name}</h3>
      <p className="r1-inspector__state">
        {onBench ? 'On the bench' : 'On the shelf'}
        {dirty ? ' · needs cleaning' : ''}
      </p>
      {!onBench && (
        <button type="button" className="r1-button" onClick={() => selectToBench(id)}>
          Take to bench
        </button>
      )}
      {id === 'watch_glass' && !onBalance && (
        <button type="button" className="r1-button r1-button--primary" onClick={weigh}>
          Weigh on the balance
        </button>
      )}
      <button
        type="button"
        className="r1-button r1-button--ghost"
        onClick={() => setFocusedItem(null)}
      >
        Close
      </button>
    </aside>
  );

  return (
    <div className="r1-stage" data-phase={phase}>
      <R1Defs />
      <div className="r1-toolbar" role="toolbar" aria-label="View controls">
        <button
          type="button"
          className="r1-button"
          onClick={() => setZoom(1.25)}
          disabled={zoom === 1.25}
        >
          Zoom in
        </button>
        <button
          type="button"
          className="r1-button"
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
        >
          Reset
        </button>
        <button
          type="button"
          className="r1-button"
          onClick={() => setZoom(0.8)}
          disabled={zoom === 0.8}
        >
          Zoom out
        </button>
        <span className="r1-toolbar__hint">
          {!watchGlass.onBench || !balance.onBench
            ? 'Try "Weigh on the balance" from the shelf — the engine will correctly reject it.'
            : 'Weigh the watch glass to see the confirmed-state animation.'}
        </span>
      </div>
      <svg
        className="r1-svg"
        viewBox={(() => {
          const w = VIEW_W / zoom;
          const h = VIEW_H / zoom;
          return `${(VIEW_W - w) / 2} ${(VIEW_H - h) / 2} ${w} ${h}`;
        })()}
        role="group"
        aria-label="Laboratory bench prototype"
      >
        <rect width={VIEW_W} height={VIEW_H} fill="#dce8ee" />
        <rect width={VIEW_W} height={WALL_BENCH_LINE} fill="#eef5f8" />
        <rect y={WALL_BENCH_LINE - 4} width={VIEW_W} height={4} fill="#9fb3bd" />
        <rect y={BENCH_Y + 42} width={VIEW_W} height={VIEW_H - BENCH_Y - 42} fill="#6d7d87" />

        {[
          {
            id: 'four_beam_balance',
            item: balance,
            pos: posOf('four_beam_balance', balance.onBench),
            onBench: balance.onBench,
          },
          {
            id: 'volumetric_flask_250',
            item: flask,
            pos: posOf('volumetric_flask_250', flask.onBench),
            onBench: flask.onBench,
          },
          {
            id: 'watch_glass',
            item: watchGlass,
            pos: watchGlassPos,
            onBench: watchGlass.onBench || onBalance,
          },
        ].map(({ id, item, pos, onBench }) => (
          <g
            key={id}
            transform={`translate(${pos[0]} ${pos[1]}) scale(${onBench ? 1 : SHELF_SCALE})`}
            opacity={onBench ? 1 : 0.88}
            role="button"
            tabIndex={0}
            aria-pressed={focusedItem === id}
            aria-label={id}
            onClick={() => setFocusedItem(id)}
            onKeyDown={keyActivate(() => setFocusedItem(id))}
            className={focusedItem === id ? 'r1-item r1-item--selected' : 'r1-item'}
          >
            {id === 'four_beam_balance' && (
              <R1Balance
                pointer={model.balance.pointer}
                angle={animatedAngle}
                reading={onBalance ? animatedReading.toFixed(2) : null}
                selected={focusedItem === id}
              />
            )}
            {id === 'volumetric_flask_250' && (
              <R1Flask
                unit={90 * flask.scale}
                level={model.workingFlaskId === id ? model.liquidLevel : 0}
                undissolved={model.workingFlaskId === id && model.undissolvedVisible}
                dirty={item.cleanliness === 'dirty'}
                selected={focusedItem === id}
              />
            )}
            {id === 'watch_glass' && (
              <R1WatchGlass
                hasSolid={model.watchGlassHasSolid}
                dirty={item.cleanliness === 'dirty'}
                selected={focusedItem === id}
              />
            )}
          </g>
        ))}
      </svg>

      {phase === 'rejected' && lastEvent && (
        <p className="r1-toast r1-toast--rejected" role="alert">
          Rejected by the engine — nothing moved.
        </p>
      )}
      {phase === 'pending' && (
        <p className="r1-toast r1-toast--pending" role="status">
          Waiting for the engine to confirm…
        </p>
      )}

      {focusedItem === 'four_beam_balance' &&
        inspectorFor(
          'four_beam_balance',
          t('exp04.apparatus.four_beam_balance'),
          balance.onBench,
          balance.cleanliness === 'dirty',
        )}
      {focusedItem === 'volumetric_flask_250' &&
        inspectorFor(
          'volumetric_flask_250',
          t('exp04.apparatus.volumetric_flask_250'),
          flask.onBench,
          flask.cleanliness === 'dirty',
        )}
      {focusedItem === 'watch_glass' &&
        inspectorFor(
          'watch_glass',
          t('exp04.apparatus.watch_glass'),
          watchGlass.onBench,
          watchGlass.cleanliness === 'dirty',
        )}

      {model.balance.watchGlassReading && (
        <p className="r1-readout">{formatQuantity(model.balance.watchGlassReading, locale, 2)}</p>
      )}
    </div>
  );
}
