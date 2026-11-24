import { TeachingInstrument2D, type TeachingProjection } from '../teaching/TeachingScene';
import { ApparatusKindSchema, type TeachingApparatusKind } from '@vlab/contracts';
import type { HandbookInstrumentKind } from './apparatus';

export function HandbookInstrument2D({
  kind,
  colour,
  active,
  tube = 'straight',
  polarity = 'positive_above',
}: {
  kind: HandbookInstrumentKind;
  colour: string;
  active: boolean;
  tube?: string;
  polarity?: string;
}) {
  if ((ApparatusKindSchema.options as readonly string[]).includes(kind))
    return (
      <TeachingInstrument2D
        kind={kind as TeachingApparatusKind}
        layout="test_tubes"
        colour={colour}
        scene={
          {
            solutionColour: 'clear',
            precipitateColour: null,
            visual: 'none',
            phase: active ? 'heat' : 'prepare',
          } as TeachingProjection['scene']
        }
      />
    );
  const glass = { fill: 'url(#handbook-glass)', stroke: '#cae4f0', strokeWidth: 2 };
  switch (kind) {
    case 'balance':
      return (
        <>
          <rect x="-85" y="-23" width="170" height="23" rx="5" fill="#294d65" />
          <path d="M-55-22V-98M-89-98H-21" stroke="#aecfdf" strokeWidth="6" />
          <rect x="-8" y="-83" width="90" height="49" rx="4" fill="#c4d3dc" />
          {[-72, -62, -52, -42].map((y) => (
            <path key={y} d={'M0 ' + y + 'H75'} stroke="#5c7382" strokeWidth="4" />
          ))}
          {[-72, -62, -52, -42].map((y, i) => (
            <path
              key={y}
              d={'M' + (8 + i * 10) + ' ' + (y - 4) + 'v8'}
              stroke="#e2ad46"
              strokeWidth="5"
            />
          ))}
        </>
      );
    case 'top_balance':
      return (
        <>
          <rect x="-52" y="-29" width="104" height="29" rx="5" fill="#294d65" />
          <ellipse cy="-43" rx="47" ry="9" fill="#bcd0db" />
          <rect x="-23" y="-22" width="46" height="15" fill="#dff3ed" />
        </>
      );
    case 'volumetric_flask':
      return (
        <>
          <path d="M-9-138H9V-60Q48-32 35-7Q25 0 0 0Q-25 0-35-7Q-48-32-9-60Z" {...glass} />
          <path d="M-10-91H10" stroke="#314d65" strokeWidth="2" />
        </>
      );
    case 'funnel':
      return <path d="M-35-87H35L6-44V-5H-6V-44Z" {...glass} />;
    case 'pipette':
      return (
        <>
          <path d="M-4-150H4V-98Q14-77 4-58V-5H-4V-58Q-14-77-4-98Z" {...glass} />
          <path d="M-5-117H5" stroke="#375b72" strokeWidth="2" />
        </>
      );
    case 'burette':
      return (
        <>
          <path d="M-7-190H7V-35H-7Z" {...glass} />
          <path d="M-4-170H4V-40H-4Z" fill={colour} opacity=".65" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={'M0 ' + (-178 + i * 11) + 'H7'} stroke="#426279" />
          ))}
          <path d="M-16-29H16M0-35V-8L5 0" fill="none" stroke="#bcd4e2" strokeWidth="5" />
        </>
      );
    case 'thermometer':
      return (
        <>
          <rect x="-6" y="-170" width="12" height="156" rx="6" {...glass} />
          <path d="M0-18V-110" stroke="#d97264" strokeWidth="4" />
          <circle cy="-14" r="9" fill="#d97264" />
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={'M2 ' + (-145 + i * 13) + 'H6'} stroke="#476d82" />
          ))}
        </>
      );
    case 'barometer':
      return (
        <>
          <rect x="-16" y="-155" width="32" height="155" rx="5" fill="#e0eaf0" />
          <path d="M0-13V-136" stroke="#608da9" strokeWidth="9" />
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={'M5 ' + (-140 + i * 14) + 'H13'} stroke="#456980" />
          ))}
        </>
      );
    case 'calorimeter':
      return (
        <>
          <path d="M-50-81H50L42 0H-42Z" fill="#e2e9ec" stroke="#a7c4d3" strokeWidth="4" />
          <path d="M-60-82H60M-51-70H51" stroke="#bbcbd4" strokeWidth="9" />
          <path d="M-39-52H39L34-8H-34Z" fill={colour} opacity=".7" />
        </>
      );
    case 'watch_glass':
      return <ellipse cy="-7" rx="48" ry="11" {...glass} />;
    case 'wire_loop':
      return (
        <>
          <path d="M-60 0L0-52" stroke="#b3c5cf" strokeWidth="5" />
          <ellipse cy="-59" rx="9" ry="7" fill="none" stroke="#b3c5cf" strokeWidth="3" />
        </>
      );
    case 'crucible':
      return (
        <>
          <path d="M-37-49H37L25-1H-25Z" fill="#ebece8" stroke="#a9bcc8" strokeWidth="3" />
          <ellipse cy="-51" rx="42" ry="8" fill="#e6e9e5" />
          <path d="M-8-59H8" stroke="#a9bcc8" strokeWidth="7" />
        </>
      );
    case 'tripod':
      return (
        <>
          <ellipse cy="-111" rx="48" ry="12" fill="none" stroke="#6b899e" strokeWidth="7" />
          <path d="M-40-110L-55 0M40-110L55 0M0-105V-2" stroke="#7997a9" strokeWidth="6" />
        </>
      );
    case 'measuring_cylinder':
      return (
        <>
          <path d="M-16-150H16V-8H-16Z" {...glass} />
          <ellipse cy="-5" rx="31" ry="6" fill="#9bbdcc" />
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={'M2 ' + (-135 + i * 12) + 'H15'} stroke="#60849a" />
          ))}
        </>
      );
    case 'cobalt_glass':
      return (
        <rect
          x="-24"
          y="-65"
          width="48"
          height="62"
          rx="4"
          fill="#35469e"
          opacity=".8"
          stroke="#a8bce3"
          strokeWidth="3"
        />
      );
    case 'power_supply':
      return (
        <>
          <rect x="-54" y="-75" width="108" height="75" rx="6" fill="#c2d1dc" />
          <rect x="-34" y="-58" width="45" height="24" fill="#234e6b" />
          <circle cx="29" cy="-22" r="10" fill={active ? '#78c58b' : '#556e7f'} />
          <circle cx="-28" cy="-17" r="5" fill="#cf7069" />
          <circle cx="-7" cy="-17" r="5" fill="#273c50" />
        </>
      );
    case 'cathode_tube':
      return (
        <>
          <rect x="-153" y="-95" width="306" height="85" rx="40" {...glass} />
          <path d="M-114-83V-22M114-83V-22" stroke="#becfd8" strokeWidth="8" />
          {(tube === 'electric' || tube === 'magnetic') && (
            <path d="M-54-83H54M-54-20H54" stroke="#e1b36a" strokeWidth="5" />
          )}
          {active && (
            <path
              data-ray-path={tube}
              d={
                tube === 'electric'
                  ? polarity === 'positive_above'
                    ? 'M-110-51Q0-51 110-74'
                    : 'M-110-51Q0-51 110-28'
                  : tube === 'magnetic'
                    ? 'M-110-51Q0-51 110-74'
                    : 'M-110-51H110'
              }
              fill="none"
              stroke="#89ef9c"
              strokeWidth="5"
            />
          )}
          {tube === 'cross' && <path d="M15-77V-27M-5-52H35" stroke="#344b5c" strokeWidth="9" />}
          {tube === 'paddle' && (
            <g transform="translate(10 -52)">
              <circle r="16" fill="#a4b8c5" stroke="#314f65" strokeWidth="3" />
              <path
                d="M-21 0H21M0-21V21M-15-15L15 15M-15 15L15-15"
                stroke="#406079"
                strokeWidth="4"
              />
            </g>
          )}
          <path d="M-100-9V0M100-9V0" stroke="#7497ab" strokeWidth="7" />
        </>
      );
    case 'molecular_kit':
      return <circle cy="-57" r="27" fill="#6eafe5" stroke="#cae1ef" strokeWidth="3" />;
  }
}
