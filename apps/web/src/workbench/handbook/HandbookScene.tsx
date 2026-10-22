import { lazy, Suspense, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  handbookPractice,
  type HandbookModel,
  type HandbookResult,
  type HandbookRun,
} from '../../engine/localAdapter';
import { Icon } from '../../components/ui/Icon';
import { StageSetupDialog } from '../StageSetupDialog';
import { BenchArrangeControls } from '../BenchArrangeControls';
import { moveBenchAssembly, type BenchOffset, type BenchOffsets } from '../benchLayout';
import { handbookApparatus, handbookSetupTarget } from './apparatus';
import { HandbookInstrument2D } from './HandbookInstrument2D';
const Scene3D = lazy(() => import('./HandbookScene3D'));
const MOLECULE_POINTS: Record<string, [number, number][]> = {
  linear: [
    [-100, 0],
    [100, 0],
  ],
  bent: [
    [-85, 55],
    [85, 55],
  ],
  trigonal_planar: [
    [0, -100],
    [-87, 50],
    [87, 50],
  ],
  tetrahedral: [
    [0, -100],
    [-100, 55],
    [80, 75],
    [60, 8],
  ],
  trigonal_pyramidal: [
    [-100, 40],
    [60, 85],
    [90, 8],
  ],
  seesaw: [
    [0, -100],
    [0, 100],
    [-100, 30],
    [90, 55],
  ],
  t_shaped: [
    [0, -100],
    [0, 100],
    [100, 0],
  ],
  square_planar: [
    [-95, -45],
    [95, -45],
    [95, 45],
    [-95, 45],
  ],
  square_pyramidal: [
    [-95, -45],
    [95, -45],
    [95, 45],
    [-95, 45],
    [0, -115],
  ],
  octahedral: [
    [-95, -45],
    [95, -45],
    [95, 45],
    [-95, 45],
    [0, -115],
    [0, 115],
  ],
};
export function HandbookScene({
  model,
  run,
  settings,
  setupControls,
}: {
  model: HandbookModel;
  run: HandbookRun;
  settings: ReactNode;
  setupControls: readonly { id: string }[];
}) {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d'),
    [selected, setSelected] = useState(''),
    [offsets, setOffsets] = useState<BenchOffsets>({}),
    [setupStep, setSetupStep] = useState<number | null>(null),
    [stage, setStage] = useState<HTMLDivElement | null>(null),
    [zoom, setZoom] = useState(1),
    [reset, setReset] = useState(0);
  const drag = useRef<{
      id: string;
      x: number;
      y: number;
      offset: BenchOffset;
      moved: boolean;
    } | null>(null),
    suppress = useRef(false);
  const [setupAnchor, setSetupAnchor] = useState<readonly [number, number] | null>(null);
  const nodes = handbookApparatus(model, run, offsets);
  const target = handbookSetupTarget(setupControls, nodes);
  const focus = nodes.find((n) => n.id === selected) ?? nodes[0]!;
  const label = (kind: string) => t(`ui.practice.instrument.${kind}`);
  const move = (id: string, p: BenchOffset) =>
    setOffsets((old) => {
      const rigs =
        model.number === 5 || model.number === 17
          ? [
              'boiling_tube',
              'retort_stand',
              'burner',
              'delivery_tube',
              'gas_collector',
              'water_bath',
            ]
          : model.number === 6
            ? ['gas_collector', 'beaker', 'retort_stand']
            : model.graphic === 'burette'
              ? ['burette', 'retort_stand', 'conical_flask']
              : model.number === 12
                ? ['crucible', 'tripod', 'burner']
                : model.graphic === 'calorimeter'
                  ? ['calorimeter', 'thermometer']
                  : [];
      return moveBenchAssembly(
        handbookApparatus(model, run, old).map((n) => ({
          ...n,
          radius: n.kind === 'cathode_tube' ? 1.8 : n.kind === 'balance' ? 1.1 : 0.5,
        })),
        old,
        id,
        p,
        rigs,
      );
    });
  let preview: HandbookResult | null = null;
  if (run.step >= model.steps.length - 1 || (model.graphic === 'molecule' && run.step >= 2))
    try {
      preview = handbookPractice.preview(run.number, run.inputs);
    } catch {
      /* Invalid readings have no fabricated result. */
    }
  const result = run.result ?? preview;
  const accepted = model.steps.slice(0, run.step);
  const heating =
    accepted.some((step) => ['heat', 'blue_flame', 'warm', 'warm_if_needed'].includes(step)) &&
    !accepted.some((step) => ['cool', 'remove_heat', 'switch_off'].includes(step));
  const rayActive = model.graphic === 'rays' && run.step >= 2 && run.step < model.steps.length;
  const active = model.graphic === 'rays' ? rayActive : heating;
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const p = event.currentTarget.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(matrix.inverse());
  };
  const svg = (
    <svg
      className="handbook-lab__scene"
      viewBox="0 0 960 480"
      role="img"
      aria-label={t(`labs.graphic.${model.graphic}`)}
      onPointerMove={(e) => {
        const start = drag.current,
          at = point(e);
        if (!start || !at) return;
        const dx = at.x - start.x,
          dy = at.y - start.y;
        if (Math.hypot(dx, dy) > 5) start.moved = true;
        if (start.moved) {
          suppress.current = true;
          move(start.id, { x: start.offset.x + dx / 85, z: start.offset.z + dy / 60 });
        }
      }}
      onPointerUp={() => {
        drag.current = null;
        window.setTimeout(() => {
          suppress.current = false;
        }, 0);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <defs>
        <linearGradient id="handbook-wall" x2="0" y2="1">
          <stop stopColor="#075b86" />
          <stop offset="1" stopColor="#06364f" />
        </linearGradient>
        <linearGradient id="handbook-glass">
          <stop stopColor="#e1f2fa" stopOpacity=".6" />
          <stop offset=".5" stopColor="#deeff8" stopOpacity=".13" />
          <stop offset="1" stopColor="#b5d1df" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <rect width="960" height="480" fill="url(#handbook-wall)" />
      <path d="M0 350H960V480H0Z" fill="#60869b" />
      <path d="M0 350H960" stroke="#acc8d7" strokeWidth="10" />
      {nodes.map((n) => (
        <g
          key={n.id}
          data-practice-instrument={n.id}
          data-position={n.x + ',' + n.z}
          role="button"
          tabIndex={0}
          aria-label={label(n.kind)}
          aria-pressed={focus.id === n.id}
          transform={'translate(' + (480 + n.x * 85) + ' ' + (345 - n.y * 85 + n.z * 60) + ')'}
          onClick={() => {
            if (!suppress.current) setSelected(n.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelected(n.id);
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const svg = e.currentTarget.ownerSVGElement,
              matrix = svg?.getScreenCTM();
            if (!svg || !matrix) return;
            const at = svg.createSVGPoint();
            at.x = e.clientX;
            at.y = e.clientY;
            const p = at.matrixTransform(matrix.inverse());
            drag.current = {
              id: n.id,
              x: p.x,
              y: p.y,
              offset: offsets[n.id] ?? { x: 0, z: 0 },
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            setSelected(n.id);
          }}
        >
          <title>{label(n.kind)}</title>
          <rect
            x="-47"
            y="-181"
            width="94"
            height="190"
            rx="10"
            fill="transparent"
            stroke={focus.id === n.id ? '#55cbf4' : 'transparent'}
            strokeWidth="3"
          />
          <g transform={'rotate(' + (-n.rotation * 180) / Math.PI + ')'}>
            <HandbookInstrument2D
              kind={n.kind}
              colour={result?.colour ?? '#b4d8e8'}
              active={active}
              tube={String(run.inputs.tube)}
              polarity={String(run.inputs.polarity)}
            />
          </g>
          {n.kind === 'molecular_kit' &&
            (MOLECULE_POINTS[result?.shape ?? 'linear'] ?? MOLECULE_POINTS.linear)!
              .slice(0, result?.bonds ?? 0)
              .map(([x, y], i) => (
                <g key={i}>
                  <path
                    d={'M0-57L' + x + ' ' + (y - 57)}
                    stroke="#dae9f1"
                    strokeWidth="8"
                    strokeDasharray={i === 2 ? '5 7' : undefined}
                  />
                  <circle
                    cx={x}
                    cy={y - 57}
                    r="19"
                    fill="#e5f4fd"
                    stroke="#a5cee5"
                    strokeWidth="2"
                  />
                </g>
              ))}
        </g>
      ))}
    </svg>
  );
  return (
    <>
      <div className="teaching-view-toolbar">
        <div role="group" aria-label={t('teaching.dimension')}>
          {(['2d', '3d'] as const).map((v) => (
            <button
              key={v}
              className={dimension === v ? 'button button--primary' : 'button'}
              type="button"
              aria-pressed={dimension === v}
              onClick={() => setDimension(v)}
            >
              {t(`ui.practice.view_${v}`)}
            </button>
          ))}
        </div>
        {dimension === '3d' && (
          <div role="group" aria-label={t('ui.lab.zoom_controls')}>
            <button
              className="button"
              type="button"
              aria-label={t('teaching.zoom_in')}
              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
            >
              +
            </button>
            <button
              className="button"
              type="button"
              aria-label={t('teaching.zoom_out')}
              onClick={() => setZoom((z) => Math.max(0.65, z - 0.1))}
            >
              −
            </button>
            <button
              className="button"
              type="button"
              onClick={() => {
                setZoom(1);
                setReset((n) => n + 1);
              }}
            >
              {t('teaching.reset_view')}
            </button>
          </div>
        )}
      </div>
      <div ref={setStage} className={'teaching-stage teaching-stage--' + dimension}>
        {dimension === '2d' ? (
          svg
        ) : (
          <Suspense fallback={<p>{t('teaching.loading3d')}</p>}>
            <Scene3D
              nodes={nodes}
              setupTarget={target.id}
              onSetupAnchor={setSetupAnchor}
              run={run}
              result={result}
              selected={focus.id}
              offsets={offsets}
              onMove={move}
              onSelect={setSelected}
              zoom={zoom}
              reset={reset}
              active={active}
              fallback={
                <>
                  {svg}
                  <p>{t('teaching.webgl_fallback')}</p>
                </>
              }
            />
          </Suspense>
        )}
        {setupControls.length > 0 && !run.completed && (
          <button
            type="button"
            className="practice-stage__setup"
            data-setup-instrument={target.id}
            style={{
              left: `clamp(8px,${(dimension === '3d' && setupAnchor ? setupAnchor[0] : (480 + target.x * 85) / 960) * 100}%,calc(100% - 110px))`,
              top: `clamp(8px,${(dimension === '3d' && setupAnchor ? setupAnchor[1] : (160 - target.y * 85 + target.z * 60) / 480) * 100}%,calc(100% - 48px))`,
            }}
            aria-label={t('ui.practice.configure_instrument', { instrument: label(target.kind) })}
            onClick={() => {
              setSelected(target.id);
              setSetupStep(run.step);
            }}
          >
            <Icon name="settings" size={18} />
            {t('ui.stage.setup')}
          </button>
        )}
      </div>
      <BenchArrangeControls
        selected={focus.id}
        label={label(focus.kind)}
        offsets={offsets}
        onMove={move}
        onReset={() => setOffsets({})}
      />
      <fieldset className="teaching-tool-list">
        <legend>{t('teaching.choose_instrument')}</legend>
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            className={focus.id === n.id ? 'button button--primary' : 'button'}
            aria-pressed={focus.id === n.id}
            onClick={() => setSelected(n.id)}
          >
            {label(n.kind)}
          </button>
        ))}
      </fieldset>
      <p className="hint-text">{t('ui.practice.render_scope')}</p>
      {setupStep === run.step && setupControls.length > 0 && (
        <StageSetupDialog
          title={t('ui.practice.configure_instrument', { instrument: label(target.kind) })}
          stage={stage}
          onClose={() => setSetupStep(null)}
        >
          {settings}
          <button
            type="button"
            className="button button--primary"
            onClick={() => setSetupStep(null)}
          >
            {t('ui.practice.save_settings')}
          </button>
        </StageSetupDialog>
      )}
    </>
  );
}
