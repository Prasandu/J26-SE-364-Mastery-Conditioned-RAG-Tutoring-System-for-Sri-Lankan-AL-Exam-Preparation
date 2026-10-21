import type { TeachingDefinition, TeachingColour } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import type { teachingPractice } from '../../engine/localAdapter';

export const TEACHING_COLOURS: Record<TeachingColour, string> = {
  clear: '#cde7ee',
  white: '#f5f2e8',
  pale_blue: '#97d6ed',
  deep_blue: '#21479a',
  blue: '#3b80d2',
  green: '#4f9a70',
  pale_green: '#b4d29e',
  pink: '#db91b6',
  pale_pink: '#f3d7e0',
  purple: '#8054ad',
  yellow: '#e4c75e',
  orange: '#de8c3b',
  red: '#c95046',
  brown: '#885b3e',
  grey: '#8c9ca5',
};
export type TeachingProjection = ReturnType<typeof teachingPractice.project>;
export interface TeachingSceneProps {
  definition: TeachingDefinition;
  projection: TeachingProjection;
  selected: string;
  onSelect: (id: string) => void;
}
export interface TeachingPlacement {
  x: number;
  y: number;
  z: number;
  rotate: number;
}

/** One apparatus arrangement is shared by both renderers. Coordinates are illustrative metres. */
export function teachingPlacement(d: TeachingDefinition, id: string): TeachingPlacement {
  const a = d.apparatus.find((x) => x.id === id)!;
  const fallback = {
    x: (d.apparatus.findIndex((x) => x.id === id) - Math.floor(d.apparatus.length / 2)) * 1.1,
    y: 0,
    z: 0,
    rotate: 0,
  };
  const positions: Record<string, Partial<TeachingPlacement>> = {
    test_tube: {
      x: 0,
      y: d.apparatus.some((x) => ['water_bath', 'ice_bath'].includes(x.kind)) ? 0.3 : 0,
    },
    glass_rod: { x: 1.5, rotate: -0.35 },
    dropper: { x: 2.5, rotate: 0.25 },
    reagent_bottle: { x: -2 },
    water_bath: { x: 0 },
    ice_bath: { x: 0 },
    beaker: { x: -3.1 },
    conical_flask: { x: -1.4 },
  };
  if (d.layout === 'gas_collection')
    Object.assign(positions, {
      boiling_tube: { x: -3, y: 1.05, rotate: -Math.PI / 2 },
      retort_stand: { x: -3.4, z: -0.3 },
      burner: { x: -2.3 },
      gas_collector: { x: 2.2, y: 1.8, rotate: Math.PI },
      water_bath: { x: 2.2 },
      test_tube: { x: 0.6 },
      glass_rod: { x: 3.4 },
      dropper: { x: 3.9 },
      delivery_tube: { x: 0 },
    });
  if (d.layout === 'inverted_tube')
    Object.assign(positions, {
      gas_collector: { x: 0, y: 1.8, rotate: Math.PI },
      beaker: { x: 0 },
      stopwatch: { x: 2.2 },
      glass_rod: { x: -2.2 },
    });
  return { ...fallback, ...positions[a.kind] };
}

export function TeachingScene2D({
  definition: d,
  projection: p,
  selected,
  onSelect,
}: TeachingSceneProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'si' ? 'si' : 'en';
  const paint = TEACHING_COLOURS[p.scene.solutionColour];
  return (
    <svg
      className="teaching-scene2d"
      viewBox="0 0 960 480"
      role="img"
      aria-label={t('teaching.scene2d')}
    >
      <defs>
        <linearGradient id="teaching-blue-wall" x2="0" y2="1">
          <stop stopColor="#075b86" />
          <stop offset="1" stopColor="#06364f" />
        </linearGradient>
        <linearGradient id="teaching-vessel">
          <stop stopColor="#e5f5ff" stopOpacity=".6" />
          <stop offset=".5" stopColor="#dff3fa" stopOpacity=".13" />
          <stop offset="1" stopColor="#b6d3e0" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <rect width="960" height="480" fill="url(#teaching-blue-wall)" />
      <path d="M0 340H960V480H0Z" fill="#69899d" />
      <path d="M0 340H960" stroke="#bcced8" strokeWidth="12" />
      {d.apparatus.map((a, i) => {
        const pos = teachingPlacement(d, a.id),
          tube = ['test_tube', 'boiling_tube', 'gas_collector'].includes(a.kind);
        const key = (e: React.KeyboardEvent<SVGGElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(a.id);
          }
        };
        return (
          <g
            key={a.id}
            role="button"
            tabIndex={0}
            aria-label={a.label[locale]}
            aria-pressed={selected === a.id}
            onKeyDown={key}
            onClick={() => onSelect(a.id)}
            transform={`translate(${480 + pos.x * 90} ${335 - pos.y * 90})`}
            className="teaching-apparatus"
          >
            <title>{a.label[locale]}</title>
            <g transform={`rotate(${(-pos.rotate * 180) / Math.PI})`}>
              <rect
                x="-28"
                y="-150"
                width="56"
                height="162"
                rx="12"
                fill="transparent"
                stroke={selected === a.id ? '#6dd9ff' : 'transparent'}
                strokeWidth="3"
              />
              {tube ? (
                <>
                  <path
                    d="M-17-128V-18Q-17 0 0 0Q17 0 17-18V-128"
                    fill="url(#teaching-vessel)"
                    stroke="#c4e0ec"
                    strokeWidth="2"
                  />
                  <path
                    d="M-14-63V-18Q-14-3 0-3Q14-3 14-18V-63Z"
                    fill={a.kind === 'gas_collector' ? '#a3cbdc' : paint}
                    opacity=".85"
                  />
                  {a.kind !== 'gas_collector' && p.scene.precipitateColour && (
                    <path
                      d="M-13-17Q0 5 13-17Z"
                      fill={TEACHING_COLOURS[p.scene.precipitateColour]}
                    />
                  )}
                  {p.scene.visual === 'silver_mirror' && a.kind === 'test_tube' && (
                    <path
                      d="M-13-59V-17Q0-4 13-17V-59"
                      fill="none"
                      stroke="#e5e8ec"
                      strokeWidth="5"
                    />
                  )}
                  {p.scene.visual === 'bubbles' &&
                    a.kind === 'test_tube' &&
                    [0, 1, 2].map((n) => (
                      <circle
                        key={n}
                        cx={n % 2 ? 6 : -5}
                        cy={-28 - n * 16}
                        r="3"
                        fill="none"
                        stroke="white"
                        className="handbook-lab__bubble"
                      />
                    ))}
                  {a.kind === 'boiling_tube' && d.layout === 'gas_collection' && (
                    <rect x="-20" y="-130" width="40" height="9" fill="#384c5e" />
                  )}
                </>
              ) : ['water_bath', 'ice_bath', 'beaker'].includes(a.kind) ? (
                <>
                  <path
                    d="M-57-72V-5Q-57 0-50 0H50Q57 0 57-5V-72"
                    fill="url(#teaching-vessel)"
                    stroke="#c4e0ec"
                    strokeWidth="2"
                  />
                  <path d="M-54-43H54V-4H-54Z" fill="#9fcce0" opacity=".6" />
                  {a.kind === 'ice_bath' &&
                    [-33, -5, 24].map((x) => (
                      <rect
                        key={x}
                        x={x}
                        y="-40"
                        width="20"
                        height="19"
                        rx="3"
                        fill="#edf8fc"
                        opacity=".7"
                      />
                    ))}
                </>
              ) : a.kind === 'conical_flask' ? (
                <path
                  d="M-14-115H14V-78L48-8Q50 0 40 0H-40Q-50 0-48-8L-14-78Z"
                  fill="url(#teaching-vessel)"
                  stroke="#c4e0ec"
                  strokeWidth="2"
                />
              ) : a.kind === 'glass_rod' ? (
                <path d="M0-132V-5" stroke="#d3e9f2" strokeWidth="6" strokeLinecap="round" />
              ) : a.kind === 'dropper' ? (
                <>
                  <path d="M0-96V-4" stroke="#d3e9f2" strokeWidth="6" />
                  <ellipse cy="-115" rx="13" ry="24" fill="#294d68" />
                </>
              ) : a.kind === 'reagent_bottle' ? (
                <>
                  <rect x="-29" y="-92" width="58" height="92" rx="9" fill="#e6eef0" />
                  <rect x="-19" y="-109" width="38" height="19" rx="3" fill="#24567c" />
                  <rect x="-22" y="-63" width="44" height="32" fill="white" />
                </>
              ) : a.kind === 'burner' ? (
                <>
                  <path d="M-30-6H30" stroke="#213e53" strokeWidth="12" />
                  <path d="M0-5V-52" stroke="#b5c9d5" strokeWidth="16" />
                  {p.scene.phase === 'heat' && (
                    <path d="M0-55Q-20-82 0-115Q20-82 0-55" fill="#63b8fa" />
                  )}
                </>
              ) : a.kind === 'retort_stand' ? (
                <>
                  <path d="M-33-3H33M-20-5V-182M-20-145H55" stroke="#b8ccd8" strokeWidth="6" />
                </>
              ) : a.kind === 'stopwatch' ? (
                <>
                  <circle cy="-42" r="37" fill="#d9e5eb" stroke="#264863" strokeWidth="7" />
                  <path d="M0-42V-65M0-42H18M-9-87H9" stroke="#264863" strokeWidth="5" />
                </>
              ) : a.kind === 'delivery_tube' ? (
                <path d="M-153-95H-100V-171H198V-43" fill="none" stroke="#bfd8e5" strokeWidth="7" />
              ) : null}
            </g>
            <g
              transform={`translate(${a.kind === 'test_tube' ? -35 : 0} ${a.kind === 'gas_collector' ? -14 : 29})`}
            >
              <circle r="12" fill={selected === a.id ? '#e3f5ff' : '#174461'} stroke="#9bbfda" />
              <text
                y="5"
                textAnchor="middle"
                fontSize="14"
                fill={selected === a.id ? '#15344e' : 'white'}
              >
                {i + 1}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
