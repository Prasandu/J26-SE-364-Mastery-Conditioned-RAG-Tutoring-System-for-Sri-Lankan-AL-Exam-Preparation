import type { SceneItem, SceneModel } from '../sceneModel';
import { Balance2D, Beaker2D, Flask2D, Funnel2D, WashBottle2D, WatchGlass2D } from './Apparatus2D';

/**
 * Decorative bench made from the same apparatus drawings as the laboratory (empty, clean
 * glassware; it shows no experiment state or data). Hidden from assistive technology.
 */
const FLASK: SceneItem = {
  id: 'illustration-flask',
  kind: 'volumetric_flask',
  nameKey: '',
  highlighted: false,
  onBench: true,
  cleanliness: null,
  scale: 1,
};

const EMPTY: SceneModel = {
  items: [],
  workingFlaskId: null,
  watchGlassHasSolid: false,
  watchGlassOnBalance: false,
  funnelOnFlask: false,
  balance: { sliderSetting: null, watchGlassReading: null, pointer: null },
  liquidLevel: 0,
  levelObservation: null,
  undissolvedVisible: false,
  spilled: false,
  stoppered: false,
  labelAttached: false,
  label: null,
  warning: false,
  reagentFormula: null,
};

const NO_LABEL = () => [];

export function LabIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? 'lab-illustration lab-illustration--compact' : 'lab-illustration'}
      viewBox={compact ? '150 40 420 230' : '0 0 720 300'}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx={360} cy={262} rx={340} ry={22} fill="rgba(255,255,255,0.18)" />
      <rect x={20} y={252} width={680} height={14} rx={7} fill="rgba(255,255,255,0.28)" />
      <g transform="translate(140 252) scale(0.9)">
        <Balance2D pointer={null} />
      </g>
      <g transform="translate(115 158) scale(0.9)">
        <WatchGlass2D hasSolid={false} dirty={false} />
      </g>
      <g transform="translate(360 252) scale(1)">
        <Flask2D item={FLASK} model={EMPTY} formatLabel={NO_LABEL} />
      </g>
      <g transform="translate(360 95) scale(0.85)">
        <Funnel2D placement="on_flask" dirty={false} />
      </g>
      <g transform="translate(500 252) scale(1)">
        <Beaker2D dirty={false} />
      </g>
      <g transform="translate(610 252) scale(1)">
        <WashBottle2D />
      </g>
    </svg>
  );
}
