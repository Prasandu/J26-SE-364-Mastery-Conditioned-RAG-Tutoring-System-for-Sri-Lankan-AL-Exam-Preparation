import type { HandbookModel, HandbookRun } from '../../engine/localAdapter';
import type { TeachingApparatusKind } from '@vlab/contracts';
import type { BenchOffsets } from '../benchLayout';

export type HandbookInstrumentKind =
  | TeachingApparatusKind
  | 'cathode_tube'
  | 'power_supply'
  | 'molecular_kit'
  | 'balance'
  | 'top_balance'
  | 'volumetric_flask'
  | 'pipette'
  | 'burette'
  | 'thermometer'
  | 'barometer'
  | 'calorimeter'
  | 'wire_loop'
  | 'watch_glass'
  | 'crucible'
  | 'tripod'
  | 'measuring_cylinder'
  | 'cobalt_glass'
  | 'funnel';
export interface HandbookInstrument {
  id: string;
  kind: HandbookInstrumentKind;
  x: number;
  y: number;
  z: number;
  rotation: number;
}
const tool = (
  kind: HandbookInstrumentKind,
  x: number,
  z = 0,
  y = 0,
  rotation = 0,
  id: string = kind,
): HandbookInstrument => ({ id, kind, x, z, y, rotation });
/** Apparatus for the supported NIE procedures, not copies of Experiment 4's glassware set.
 * Handbook PDF: 18–28, 31–40, 43–53, 54–76. Equipment is illustrative, not a calibrated reading. */
export function handbookApparatus(
  model: HandbookModel,
  run: HandbookRun,
  offsets: BenchOffsets = {},
): HandbookInstrument[] {
  let nodes: HandbookInstrument[];
  switch (model.graphic) {
    case 'rays':
      nodes = [tool('cathode_tube', 0, 0, 0.3), tool('power_supply', -3, 0.3)];
      break;
    case 'molecule':
      nodes = [tool('molecular_kit', 0, 0, 0.6)];
      break;
    case 'balance':
      nodes = [
        tool('balance', -2.5),
        tool(
          (['volumetric_flask', 'pipette', 'burette', 'funnel', 'watch_glass', 'beaker'].includes(
            String(run.inputs.glassware),
          )
            ? run.inputs.glassware
            : 'beaker') as HandbookInstrumentKind,
          0,
        ),
        tool('watch_glass', 2.2, 0, 0, 0, 'weights'),
      ];
      break;
    case 'gas':
      nodes =
        model.number === 6
          ? [
              tool('gas_collector', 0, 0, 1.8, Math.PI),
              tool('beaker', 0),
              tool('retort_stand', -1),
              tool('thermometer', 2.1),
              tool('barometer', 3.3),
            ]
          : [
              tool('boiling_tube', -2.9, 0, 1.05, -Math.PI / 2),
              tool('retort_stand', -3.3, -0.3),
              tool('burner', -2.3),
              tool('delivery_tube', 0),
              tool('gas_collector', 2.2, 0, 1.8, Math.PI),
              tool('water_bath', 2.2),
              tool('top_balance', -3.3, 0.8),
              tool('thermometer', 3.3),
              tool('barometer', 4.3),
            ];
      break;
    case 'calorimeter':
      nodes = [
        tool('calorimeter', 0),
        tool('thermometer', 0, 0, 0.1),
        tool('glass_rod', 1.7),
        tool('beaker', -2.5),
        tool('reagent_bottle', 3),
      ];
      break;
    case 'burette':
      nodes = [
        tool('burette', 0, 0, 1.2),
        tool('retort_stand', -0.7, -0.3),
        tool('conical_flask', 0, 0.1),
        tool('pipette', -2.2),
        tool('volumetric_flask', 2.4),
        tool('funnel', 3.5),
        tool('glass_rod', -3.5),
      ];
      break;
    case 'flame':
      nodes = [
        tool('burner', 0),
        tool('wire_loop', 0.6, 0, 1.1),
        tool('reagent_bottle', -2),
        tool('watch_glass', 2),
        tool('cobalt_glass', 3.3),
      ];
      break;
    case 'tube':
      nodes =
        model.number === 12
          ? [
              tool('crucible', 0, 0, 1.2),
              tool('tripod', 0),
              tool('burner', 0),
              tool('beaker', -2.5),
              tool('dropper', 2.2),
              tool('test_tube', 3.3),
            ]
          : model.number === 17
            ? [
                tool('boiling_tube', -2.9, 0, 1.05, -Math.PI / 2),
                tool('retort_stand', -3.3, -0.3),
                tool('burner', -2.3),
                tool('delivery_tube', 0),
                tool('test_tube', 2.2),
                tool('glass_rod', 3.5),
              ]
            : [
                tool('test_tube', 0),
                tool('dropper', 1.3),
                tool('glass_rod', 2.3),
                tool('beaker', -2.6),
                tool(model.number === 18 ? 'measuring_cylinder' : 'reagent_bottle', -1.3),
              ];
      break;
  }
  return nodes.map((n) => {
    const p = offsets[n.id];
    return p ? { ...n, x: n.x + p.x, z: n.z + p.z } : n;
  });
}
export function handbookSetupTarget(
  controls: readonly { id: string }[],
  nodes: readonly HandbookInstrument[],
): HandbookInstrument {
  const numeric =
    controls.find((c) => /temperature|rise|burette|mass|sliders|gas_volume/.test(c.id))?.id ??
    controls[0]?.id ??
    '';
  const kind: HandbookInstrumentKind = /temperature|rise/.test(numeric)
    ? 'thermometer'
    : /burette/.test(numeric)
      ? 'burette'
      : /mass|sliders|known_mass/.test(numeric)
        ? 'balance'
        : numeric === 'gas_volume'
          ? 'gas_collector'
          : numeric === 'molecule'
            ? 'molecular_kit'
            : numeric === 'tube' || numeric === 'polarity'
              ? 'power_supply'
              : 'reagent_bottle';
  return (
    nodes.find((n) => n.kind === kind || (kind === 'balance' && n.kind === 'top_balance')) ??
    nodes[0]!
  );
}
