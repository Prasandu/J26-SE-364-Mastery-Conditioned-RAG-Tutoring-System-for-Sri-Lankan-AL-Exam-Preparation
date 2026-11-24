/** Deterministic, local 2D teaching models. These do not reuse the Experiment 4 state/schema.
 * Every numeric input is an instrument setting or a learner-entered reading, not a hidden
 * experimental answer. Thermochemistry deliberately calculates from supplied temperatures:
 * the approved sources do not specify measured neutralization enthalpies for all four pairs.
 */
import assessment from '../../../content/experiments/handbook/assessment.v1.json';

export type HandbookInputs = Readonly<Record<string, string | number>>;
export interface HandbookControl {
  id: string;
  labelKey: string;
  options?: readonly string[];
  min?: number;
  max?: number;
  unit?: string;
  initial: string | number;
  liveAt?: readonly number[];
}
export interface HandbookModel {
  number: number;
  version: '1.0.0';
  graphic: 'rays' | 'molecule' | 'balance' | 'gas' | 'calorimeter' | 'tube' | 'flame' | 'burette';
  controls: readonly HandbookControl[];
  steps: readonly string[];
  handbookPages: readonly number[];
  resourcePages: readonly number[];
  scopeKey: string;
}
export interface HandbookReading {
  label: string;
  value: number;
  unit: string;
}
export interface HandbookResult {
  observation: string;
  colour: string;
  readings: readonly HandbookReading[];
  equation?: string;
  shape?: string;
  bonds?: number;
  lonePairs?: number;
}
export interface HandbookTrial {
  inputs: HandbookInputs;
  result: HandbookResult;
}
export interface HandbookRun {
  number: number;
  version: '1.0.0';
  sequence: number;
  safety: boolean;
  step: number;
  inputs: HandbookInputs;
  result: HandbookResult | null;
  trials: readonly HandbookTrial[];
  notes: string;
  completed: boolean;
  recorded: boolean;
  events: readonly { sequence: number; action: HandbookAction }[];
}
export type HandbookAction =
  | { type: 'safety'; value: boolean }
  | { type: 'input'; id: string; value: string | number }
  | { type: 'step'; id: string }
  | { type: 'record' }
  | { type: 'next_trial' }
  | { type: 'finish' }
  | { type: 'notes'; value: string };
export type HandbookError =
  | 'invalid_input'
  | 'safety_required'
  | 'wrong_order'
  | 'no_result'
  | 'stale_sequence'
  | 'unsupported'
  | 'dangerous_combination'
  | 'completed'
  | 'inconsistent_trials';
export type HandbookTransition =
  | { accepted: true; state: HandbookRun }
  | { accepted: false; state: HandbookRun; error: HandbookError };

const choice = (id: string, options: readonly string[]): HandbookControl => ({
  id,
  labelKey: `labs.input.${id}`,
  options,
  initial: options[0]!,
});
const numeric = (
  id: string,
  initial: number,
  min: number,
  max: number,
  unit: string,
): HandbookControl => ({ id, labelKey: `labs.input.${id}`, initial, min, max, unit });
const model = (
  number: number,
  graphic: HandbookModel['graphic'],
  controls: readonly HandbookControl[],
  steps: readonly string[],
  handbookPages: readonly number[],
  resourcePages: readonly number[],
  scopeKey = 'labs.scope.qualitative',
): HandbookModel => ({
  number,
  version: '1.0.0',
  graphic,
  controls,
  steps,
  handbookPages,
  resourcePages,
  scopeKey,
});

// Formula labels are language independent. Observations and all interface text are locale keys.
export const moleculeModels: Readonly<Record<string, readonly [number, number, string]>> = {
  O3: [2, 1, 'bent'],
  BeCl2: [2, 0, 'linear'],
  BF3: [3, 0, 'trigonal_planar'],
  CH4: [4, 0, 'tetrahedral'],
  NH3: [3, 1, 'trigonal_pyramidal'],
  H2O: [2, 2, 'bent'],
  PCl3: [3, 1, 'trigonal_pyramidal'],
  SF6: [6, 0, 'octahedral'],
  SF4: [4, 1, 'seesaw'],
  ClF3: [3, 2, 't_shaped'],
  XeF2: [2, 3, 'linear'],
  XeF4: [4, 2, 'square_planar'],
  IF5: [5, 1, 'square_pyramidal'],
  'NH4+': [4, 0, 'tetrahedral'],
  'SO4^2-': [4, 0, 'tetrahedral'],
  'CO3^2-': [3, 0, 'trigonal_planar'],
  'NO3-': [3, 0, 'trigonal_planar'],
  O2: [1, 2, 'linear'],
  N2: [1, 1, 'linear'],
  H2: [1, 0, 'linear'],
};
const gasControls = [
  numeric('temperature', assessment.exampleReadings.gas.temperatureC, 20, 30, '°C'),
  numeric('pressure', assessment.exampleReadings.gas.pressureMmHg, 100, 1000, 'mmHg'),
];
const models: readonly HandbookModel[] = [
  model(
    1,
    'rays',
    [
      choice('tube', ['straight', 'cross', 'paddle', 'electric', 'magnetic']),
      choice('polarity', ['positive_above', 'positive_below']),
    ],
    ['connect', 'energize', 'observe', 'switch_off'],
    [18, 19, 20, 21, 22],
    [13, 14, 15],
    'labs.scope.rays',
  ),
  model(
    2,
    'molecule',
    [choice('molecule', Object.keys(moleculeModels))],
    ['choose_centre', 'assemble', 'inspect'],
    [23, 24],
    [65, 66, 67, 68, 69, 70, 71],
    'labs.scope.geometry',
  ),
  model(
    3,
    'balance',
    [
      choice('glassware', [
        'beaker',
        'volumetric_flask',
        'pipette',
        'burette',
        'funnel',
        'watch_glass',
      ]),
      choice('known_mass', ['5', '10', '50']),
      { ...numeric('sliders', 0, 0, 100, 'g'), liveAt: [3] },
    ],
    ['inspect_glassware', 'zero_balance', 'load_pan', 'read_balance'],
    [25, 26, 27, 28],
    [],
    'labs.scope.balance',
  ),
  model(
    5,
    'gas',
    [
      numeric('mass_before', assessment.exampleReadings.oxygen.massBeforeG, 0.001, 100, 'g'),
      numeric('mass_after', assessment.exampleReadings.oxygen.massAfterG, 0, 100, 'g'),
      numeric('gas_volume', assessment.exampleReadings.oxygen.volumeCm3, 1, 1000, 'cm³'),
      ...gasControls,
    ],
    ['assemble', 'weigh_before', 'heat', 'cool', 'equalize', 'read_gas'],
    [31, 32, 33, 34, 36],
    [],
    'labs.scope.gas_readings',
  ),
  model(
    6,
    'gas',
    [
      numeric('magnesium_mass', assessment.exampleReadings.hydrogen.magnesiumMassG, 0.001, 1, 'g'),
      numeric('gas_volume', assessment.exampleReadings.hydrogen.volumeCm3, 1, 1000, 'cm³'),
      ...gasControls,
    ],
    ['assemble', 'add_acid', 'invert', 'react', 'equalize', 'read_gas'],
    [35, 36, 37, 38],
    [],
    'labs.scope.gas_readings',
  ),
  model(
    7,
    'calorimeter',
    [
      choice('pair', ['NaOH + HCl', 'KOH + HNO3', 'NaOH + CH3COOH', 'NH4OH + HCl']),
      choice('data_mode', ['practice_dataset', 'entered_readings']),
      numeric('initial_acid', 25, 0, 100, '°C'),
      numeric('initial_base', 25, 0, 100, '°C'),
      numeric('final_temperature', 25, 0, 100, '°C'),
    ],
    ['insulate', 'measure_initial', 'mix', 'stir', 'read_maximum'],
    [39, 40, 41, 42],
    [],
    'labs.scope.calorimetry',
  ),
  model(
    8,
    'calorimeter',
    [
      choice('data_mode', ['practice_dataset', 'entered_readings']),
      numeric('rise_a', 0, -50, 100, 'K'),
      numeric('rise_b', 0, -50, 100, 'K'),
      numeric('rise_c', 0, -50, 100, 'K'),
      numeric('rise_d', 0, -50, 100, 'K'),
    ],
    ['insulate', 'path_a', 'path_b', 'rinse', 'path_c', 'path_d', 'compare_paths'],
    [43, 44, 45, 46, 47, 48, 49],
    [],
    'labs.scope.hess',
  ),
  model(
    9,
    'tube',
    [
      choice('metal', ['Na', 'Mg', 'Ca']),
      choice('medium', ['air', 'cold_water', 'hot_water', 'dilute_HCl']),
    ],
    ['prepare_sample', 'expose', 'observe'],
    [50, 51],
    [133, 134, 138, 139],
  ),
  model(
    10,
    'flame',
    [
      choice('salt', [
        'Li2CO3',
        'NaCl',
        'Na2SO4',
        'Na2CO3',
        'KCl',
        'MgCl2',
        'MgSO4',
        'CaCl2',
        'SrCl2',
        'BaCl2',
      ]),
    ],
    ['clean_wire', 'wet_wire', 'blue_flame', 'observe'],
    [52, 53],
    [136, 140],
    'labs.scope.flame',
  ),
  model(
    11,
    'tube',
    [choice('anion', ['SO4^2-', 'SO3^2-', 'S2-', 'S2O3^2-', 'NO3-', 'NO2-', 'CO3^2-'])],
    ['prepare_sample', 'add_reagent', 'confirm', 'observe'],
    [54, 55, 56],
    [151, 156, 157, 158, 159],
    'labs.scope.anions',
  ),
  model(
    12,
    'tube',
    [choice('detector', ['Nessler', 'wet_red_litmus'])],
    ['clean_magnesium', 'close_lid', 'heat', 'cool', 'add_water', 'test_gas'],
    [57, 58, 65],
    [138, 151],
    'labs.scope.nitrogen',
  ),
  model(
    13,
    'tube',
    [
      choice('halide', ['Cl-', 'Br-', 'I-']),
      choice('halide_test', ['AgNO3_dilute_NH3', 'AgNO3_concentrated_NH3', 'chlorine_water_CHCl3']),
    ],
    ['prepare_sample', 'add_reagent', 'confirm', 'observe'],
    [59, 60, 61],
    [159, 160],
    'labs.scope.halides',
  ),
  model(
    14,
    'burette',
    [
      numeric(
        'iodate_concentration',
        assessment.exampleReadings.iodometry.iodateMolDm3,
        0.001,
        1,
        'mol dm⁻³',
      ),
      numeric('initial_burette', assessment.exampleReadings.iodometry.initialCm3, 0, 50, 'cm³'),
      numeric('final_burette', assessment.exampleReadings.iodometry.finalCm3, 0.01, 50, 'cm³'),
    ],
    [
      'rinse_pipette',
      'transfer_iodate',
      'acid_and_iodide',
      'rinse_burette',
      'titrate_pale',
      'add_starch',
      'titrate_endpoint',
    ],
    [62, 63, 64],
    [],
    'labs.scope.titration_readings',
  ),
  model(
    15,
    'tube',
    [
      choice('ammonia_sample', ['NH3_aq', 'NH4Cl_plus_NaOH', 'NH4Cl_aq']),
      choice('detector', ['wet_red_litmus', 'HCl_rod', 'Nessler']),
    ],
    ['prepare_sample', 'warm_if_needed', 'test_gas', 'observe'],
    [65, 66],
    [151],
  ),
  model(
    16,
    'tube',
    [
      choice('cation', ['K+', 'Mg2+', 'Ca2+', 'Sr2+', 'Ba2+']),
      choice('anion_salt', [
        'Cl-',
        'Br-',
        'I-',
        'OH-',
        'S2-',
        'NO3-',
        'NO2-',
        'CO3^2-',
        'HCO3-',
        'SO4^2-',
        'SO3^2-',
        'C2O4^2-',
        'PO4^3-',
        'CrO4^2-',
      ]),
    ],
    ['prepare_sample', 'add_dropwise', 'swirl', 'observe'],
    [67, 68],
    [140],
    'labs.scope.solubility',
  ),
  model(
    17,
    'tube',
    [
      choice('thermal_sample', [
        'Na2CO3',
        'NaHCO3',
        'K2CO3',
        'MgCO3',
        'CaCO3',
        'SrCO3',
        'BaCO3',
        'NaNO3',
        'KNO3',
        'Mg(NO3)2',
        'Ca(NO3)2',
        'Sr(NO3)2',
        'Ba(NO3)2',
      ]),
    ],
    [
      'prepare_sample',
      'connect_delivery',
      'heat',
      'test_gas',
      'disconnect_delivery',
      'remove_heat',
    ],
    [69, 70],
    [134, 135, 139],
    'labs.scope.thermal',
  ),
  model(
    18,
    'tube',
    [choice('aqueous_ion', ['Cr3+', 'Mn2+', 'Fe2+', 'Fe3+', 'Co2+', 'Cu2+', 'Ni2+', 'Zn2+'])],
    ['weigh_salt', 'add_distilled_water', 'stir', 'observe'],
    [71, 72],
    [180, 181],
    'labs.scope.aqueous',
  ),
  model(
    19,
    'burette',
    [
      numeric(
        'permanganate_concentration',
        assessment.exampleReadings.ferrous.permanganateMolDm3,
        0.001,
        1,
        'mol dm⁻³',
      ),
      numeric('initial_burette', assessment.exampleReadings.ferrous.initialCm3, 0, 50, 'cm³'),
      numeric('final_burette', assessment.exampleReadings.ferrous.finalCm3, 0.01, 50, 'cm³'),
    ],
    [
      'prepare_ferrous',
      'pipette_sample',
      'add_acids',
      'rinse_burette',
      'titrate_endpoint',
      'wait_30_seconds',
    ],
    [73, 74],
    [],
    'labs.scope.titration_readings',
  ),
  model(
    20,
    'burette',
    [
      numeric(
        'oxalate_concentration',
        assessment.exampleReadings.oxalate.oxalateMolDm3,
        0.001,
        1,
        'mol dm⁻³',
      ),
      numeric('initial_burette', assessment.exampleReadings.oxalate.initialCm3, 0, 50, 'cm³'),
      numeric('final_burette', assessment.exampleReadings.oxalate.finalCm3, 0.01, 50, 'cm³'),
    ],
    [
      'prepare_oxalate',
      'pipette_sample',
      'add_acid',
      'warm',
      'rinse_burette',
      'titrate_endpoint',
      'wait_30_seconds',
    ],
    [75, 76],
    [],
    'labs.scope.titration_readings',
  ),
];
export const handbookModels: ReadonlyMap<number, HandbookModel> = new Map(
  models.map((m) => [
    m.number,
    {
      ...m,
      controls: m.controls.map((control) => {
        // Learner-entered instrument readings can be entered at their actual procedural step.
        // This changes input timing, never the measured values, outcomes or calculation rules.
        const stages: Record<string, readonly string[]> = {
          mass_before: ['weigh_before'],
          mass_after: ['cool', 'equalize', 'read_gas'],
          gas_volume: ['equalize', 'read_gas'],
          temperature: ['equalize', 'read_gas'],
          pressure: ['equalize', 'read_gas'],
          vapour_pressure: ['equalize', 'read_gas'],
          magnesium_mass: ['assemble'],
          initial_acid: ['measure_initial'],
          initial_base: ['measure_initial'],
          final_temperature: ['read_maximum'],
          rise_a: ['path_a'],
          rise_b: ['path_b'],
          rise_c: ['path_c'],
          rise_d: ['path_d'],
          initial_burette: ['rinse_burette'],
          final_burette: ['titrate_endpoint', 'wait_30_seconds'],
        };
        const matches = m.steps.flatMap((step, index) =>
          stages[control.id]?.includes(step) ? [index] : [],
        );
        return matches.length
          ? { ...control, liveAt: [...new Set([...(control.liveAt ?? []), ...matches])] }
          : control;
      }),
    },
  ]),
);
export function initialHandbookRun(number: number): HandbookRun {
  const spec = handbookModels.get(number);
  if (!spec) throw new Error('Unsupported handbook practical');
  return {
    number,
    version: spec.version,
    sequence: 0,
    safety: false,
    step: 0,
    inputs: Object.fromEntries(spec.controls.map((c) => [c.id, c.initial])),
    result: null,
    trials: [],
    notes: '',
    completed: false,
    recorded: false,
    events: [],
  };
}
const reading = (label: string, value: number, unit: string): HandbookReading => ({
  label: `labs.reading.${label}`,
  value,
  unit,
});
const result = (
  observation: string,
  colour = '#b9dfea',
  readings: readonly HandbookReading[] = [],
  equation?: string,
): HandbookResult => ({
  observation: `labs.observation.${observation}`,
  colour,
  readings,
  ...(equation ? { equation } : {}),
});
const vapour: Readonly<Record<number, number>> = {
  20: 17.5,
  21: 18.7,
  22: 19.8,
  23: 21.1,
  24: 22.4,
  25: 23.8,
  26: 25.2,
  27: 26.7,
  28: 28.3,
  29: 30,
  30: 31.8,
};
const solubility: Readonly<Record<string, readonly string[]>> = {
  'Cl-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'Br-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'I-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'OH-': ['aq', 'IS', 'SS', 'SS', 'aq'],
  'S2-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'NO3-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'NO2-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'CO3^2-': ['aq', 'IS', 'IS', 'IS', 'IS'],
  'HCO3-': ['aq', 'aq', 'aq', 'aq', 'aq'],
  'SO4^2-': ['aq', 'aq', 'SS', 'IS', 'IS'],
  'SO3^2-': ['aq', 'SS', 'IS', 'IS', 'IS'],
  'C2O4^2-': ['aq', 'SS', 'IS', 'IS', 'SS'],
  'PO4^3-': ['aq', 'IS', 'IS', 'IS', 'IS'],
  'CrO4^2-': ['aq', 'aq', 'aq', 'IS', 'IS'],
};

/** No sampling, asynchronous I/O, answer-key lookup or scoring in these calculations. */
export function calculateHandbook(number: number, inputs: HandbookInputs): HandbookResult {
  const n = (id: string) => Number(inputs[id]);
  const s = (id: string) => String(inputs[id]);
  switch (number) {
    case 1:
      return result(
        s('tube') === 'electric'
          ? s('polarity') === 'positive_above'
            ? 'rays_up'
            : 'rays_down'
          : s('tube') === 'magnetic'
            ? 'rays_magnetic'
            : s('tube') === 'cross'
              ? 'rays_shadow'
              : s('tube') === 'paddle'
                ? 'rays_paddle'
                : 'rays_straight',
        '#76de92',
      );
    case 2: {
      const molecule = moleculeModels[s('molecule')];
      if (!molecule) throw new Error('Unknown molecule');
      return {
        ...result('molecule_model'),
        bonds: molecule[0],
        lonePairs: molecule[1],
        shape: molecule[2],
      };
    }
    case 3: {
      const difference = n('known_mass') - n('sliders');
      return result(
        Math.abs(difference) < 1e-8
          ? 'balance_equal'
          : difference > 0
            ? 'balance_heavy'
            : 'balance_light',
        '#b9dfea',
        [
          reading('mass', n('known_mass'), 'g'),
          reading('sliders', n('sliders'), 'g'),
          reading('difference', difference, 'g'),
        ],
      );
    }
    case 5:
    case 6: {
      const temperature = n('temperature');
      if (!Number.isInteger(temperature) || vapour[temperature] === undefined)
        throw new Error('Temperature is not tabulated');
      const dry = n('pressure') - vapour[temperature]!;
      if (dry <= 0) throw new Error('Nonpositive gas pressure');
      const stpVolume =
        ((((n('gas_volume') / 1000) * dry) / 760) * 273.15) / (temperature + 273.15);
      const values = [
        reading('dry_pressure', dry, 'mmHg'),
        reading('stp_volume', stpVolume, 'dm³'),
      ];
      if (number === 5) {
        const mass = n('mass_before') - n('mass_after');
        if (mass <= 0) throw new Error('Nonpositive mass loss');
        const moles = mass / 32;
        return result('oxygen_collected', '#b9dfea', [
          ...values,
          reading('amount', moles, 'mol'),
          reading('molar_volume', stpVolume / moles, 'dm³ mol⁻¹'),
        ]);
      }
      const moles =
        (((dry * 101000) / 760) * (n('gas_volume') * 1e-6)) / (8.314 * (temperature + 273.15));
      return result(
        'hydrogen_collected',
        '#b9dfea',
        [
          ...values,
          reading('amount', moles, 'mol'),
          reading('molar_mass', n('magnesium_mass') / moles, 'g mol⁻¹'),
        ],
        'Mg + 2HCl → MgCl2 + H2',
      );
    }
    case 7: {
      const synthetic = s('data_mode') === 'practice_dataset';
      const initial = synthetic
        ? assessment.neutralization.initialTemperatureC
        : (n('initial_acid') + n('initial_base')) / 2;
      const rise = synthetic
        ? assessment.neutralization.temperatureRiseK[
            s('pair') as keyof typeof assessment.neutralization.temperatureRiseK
          ]
        : n('final_temperature') - initial;
      const heat = 100 * 4.2 * rise;
      return result('calorimetry_readings', '#b9dfea', [
        reading('initial_temperature', initial, '°C'),
        reading('final_temperature', initial + rise, '°C'),
        reading('temperature_rise', rise, 'K'),
        reading('heat', heat, 'J'),
        reading('enthalpy', -heat / 0.1 / 1000, 'kJ mol⁻¹'),
      ]);
    }
    case 8: {
      const masses = [125, 250, 250, 250];
      const h =
        s('data_mode') === 'practice_dataset'
          ? assessment.hess.reactionEnthalpiesKJPerMol
          : [n('rise_a'), n('rise_b'), n('rise_c'), n('rise_d')].map(
              (v, i) => (-v * masses[i]! * 4.2) / 0.25 / 1000,
            );
      return result('hess_comparison', '#b9dfea', [
        ...h.map((v, i) => reading(`rise_${i + 1}`, (-v * 1000 * 0.25) / (masses[i]! * 4.2), 'K')),
        ...h.map((v, i) => reading(`hess_${i + 1}`, v, 'kJ mol⁻¹')),
        reading('path_difference', h[0]! + h[1]! - h[2]! - h[3]!, 'kJ mol⁻¹'),
      ]);
    }
    case 9: {
      const metal = s('metal'),
        medium = s('medium');
      if (metal === 'Na' && medium === 'dilute_HCl')
        throw new Error('Unsafe sodium acid combination');
      return result(
        medium === 'air'
          ? 'metal_oxidation'
          : metal === 'Mg' && medium === 'cold_water'
            ? 'magnesium_cold'
            : metal === 'Mg' && medium === 'hot_water'
              ? 'magnesium_hot'
              : metal === 'Na'
                ? 'sodium_water'
                : 'metal_hydrogen',
      );
    }
    case 10: {
      const salt = s('salt');
      const key = salt.startsWith('Li')
        ? 'flame_red'
        : salt.startsWith('Na')
          ? 'flame_yellow'
          : salt === 'KCl'
            ? 'flame_lilac'
            : salt.startsWith('Mg')
              ? 'flame_none'
              : salt === 'CaCl2'
                ? 'flame_orange'
                : salt === 'SrCl2'
                  ? 'flame_crimson'
                  : 'flame_green';
      const colours: Record<string, string> = {
        flame_red: '#e64955',
        flame_yellow: '#ffd349',
        flame_lilac: '#bb8ae5',
        flame_none: '#4f9ddd',
        flame_orange: '#ee813e',
        flame_crimson: '#d92e53',
        flame_green: '#a0c447',
      };
      return result(key, colours[key]!);
    }
    case 11: {
      const observations: Record<string, string> = {
        'SO4^2-': 'sulfate',
        'SO3^2-': 'sulfite',
        'S2-': 'sulfide',
        'S2O3^2-': 'thiosulfate',
        'NO3-': 'nitrate',
        'NO2-': 'nitrite',
        'CO3^2-': 'carbonate',
      };
      return result(
        observations[s('anion')]!,
        s('anion') === 'S2-' ? '#303030' : s('anion') === 'NO3-' ? '#8b563d' : '#e4e7dc',
      );
    }
    case 12:
      return result(
        s('detector') === 'Nessler' ? 'nessler_brown' : 'litmus_blue',
        s('detector') === 'Nessler' ? '#885734' : '#5278d9',
        [],
        'Mg3N2 + 6H2O → 3Mg(OH)2 + 2NH3',
      );
    case 13: {
      const halide = s('halide'),
        test = s('halide_test');
      if (test.startsWith('AgNO3')) {
        const dissolved =
          halide === 'Cl-' || (halide === 'Br-' && test === 'AgNO3_concentrated_NH3');
        return result(
          dissolved ? 'silver_dissolves' : halide === 'Br-' ? 'silver_bromide' : 'silver_iodide',
          dissolved ? '#c6e1ea' : halide === 'Br-' ? '#e8dfb3' : '#ead24c',
        );
      }
      return result(
        test === 'Pb2+_heat_cool'
          ? 'lead_heat_cool'
          : halide === 'Cl-'
            ? 'halide_no_displacement'
            : halide === 'Br-'
              ? 'bromine_layer'
              : 'iodine_layer',
        halide === 'I-' ? '#a65aca' : halide === 'Br-' ? '#b97945' : '#c6e1ea',
      );
    }
    case 14:
    case 19:
    case 20: {
      const titre = n('final_burette') - n('initial_burette');
      if (titre <= 0) throw new Error('Nonpositive titre');
      const value =
        number === 14
          ? (n('iodate_concentration') * 25 * 6) / titre
          : number === 19
            ? (n('permanganate_concentration') * titre * 5) / 25
            : (n('oxalate_concentration') * 25 * 2) / (titre * 5);
      return result(
        number === 14 ? 'starch_colourless' : 'permanent_pink',
        number === 14 ? '#c6e1ea' : '#f4c3db',
        [reading('titre', titre, 'cm³'), reading('concentration', value, 'mol dm⁻³')],
        number === 14
          ? 'IO3− + 5I− + 6H+ → 3I2 + 3H2O; I2 + 2S2O3²− → 2I− + S4O6²−'
          : number === 19
            ? 'MnO4− + 8H+ + 5Fe²+ → Mn²+ + 5Fe³+ + 4H2O'
            : '2MnO4− + 5C2O4²− + 16H+ → 2Mn²+ + 10CO2 + 8H2O',
      );
    }
    case 15: {
      const detector = s('detector');
      return result(
        detector === 'Nessler'
          ? 'nessler_brown'
          : detector === 'HCl_rod'
            ? s('ammonia_sample') === 'NH4Cl_aq'
              ? 'ammonium_no_gas'
              : 'ammonia_fumes'
            : s('ammonia_sample') === 'NH4Cl_aq'
              ? 'ammonium_acidic'
              : 'litmus_blue',
        detector === 'Nessler' ? '#885734' : detector === 'HCl_rod' ? '#eef0f0' : '#5278d9',
      );
    }
    case 16: {
      const index = ['K+', 'Mg2+', 'Ca2+', 'Sr2+', 'Ba2+'].indexOf(s('cation'));
      const classification = solubility[s('anion_salt')]?.[index];
      if (!classification) throw new Error('Unknown salt combination');
      return result(
        `solubility_${classification}`,
        classification === 'aq' ? '#c6e1ea' : s('anion_salt') === 'CrO4^2-' ? '#e9ce43' : '#e4e7dc',
      );
    }
    case 17: {
      const sample = s('thermal_sample');
      return result(
        sample === 'Na2CO3' || sample === 'K2CO3'
          ? 'carbonate_stable'
          : sample.includes('NO3')
            ? sample.startsWith('Na') || sample.startsWith('K')
              ? 'nitrate_oxygen'
              : 'nitrate_nitrogen_dioxide'
            : 'carbonate_carbon_dioxide',
        sample.includes('NO3') && !sample.startsWith('Na') && !sample.startsWith('K')
          ? '#b57d4e'
          : '#e4e7dc',
      );
    }
    case 18: {
      const colours: Record<string, readonly [string, string]> = {
        'Cr3+': ['aqua_violet', '#9d91c5'],
        'Mn2+': ['aqua_pale_pink', '#f5dfe5'],
        'Fe2+': ['aqua_pale_green', '#b5d9ad'],
        'Fe3+': ['aqua_yellow_brown', '#bd9657'],
        'Co2+': ['aqua_pink', '#e3a8ca'],
        'Cu2+': ['aqua_pale_blue', '#8fcbec'],
        'Ni2+': ['aqua_green', '#8fc098'],
        'Zn2+': ['aqua_colourless', '#c6e1ea'],
      };
      const colour = colours[s('aqueous_ion')];
      if (!colour) throw new Error('Unknown ion');
      return result(colour[0], colour[1]);
    }
    default:
      throw new Error('Unsupported practical');
  }
}

export function transitionHandbook(
  state: HandbookRun,
  action: HandbookAction,
  expectedSequence: number,
): HandbookTransition {
  const spec = handbookModels.get(state.number);
  const reject = (error: HandbookError): HandbookTransition => ({ accepted: false, state, error });
  if (!spec || state.version !== spec.version) return reject('unsupported');
  if (expectedSequence !== state.sequence) return reject('stale_sequence');
  if (state.completed && action.type !== 'notes' && action.type !== 'next_trial')
    return reject('completed');
  let next = { ...state };
  switch (action.type) {
    case 'notes':
      if (action.value.length > 20000) return reject('invalid_input');
      next.notes = action.value;
      break;
    case 'safety':
      if (state.step > 0) return reject('wrong_order');
      next.safety = action.value;
      break;
    case 'input': {
      const control = spec.controls.find((c) => c.id === action.id);
      if (!control) return reject('invalid_input');
      if (state.step > 0 && !control.liveAt?.includes(state.step)) return reject('wrong_order');
      if (control.options) {
        if (typeof action.value !== 'string' || !control.options.includes(action.value))
          return reject('invalid_input');
      } else if (
        typeof action.value !== 'number' ||
        !Number.isFinite(action.value) ||
        action.value < (control.min ?? -Infinity) ||
        action.value > (control.max ?? Infinity)
      )
        return reject('invalid_input');
      next.inputs = { ...state.inputs, [action.id]: action.value };
      break;
    }
    case 'step': {
      if (!state.safety) return reject('safety_required');
      if (spec.steps[state.step] !== action.id) return reject('wrong_order');
      if (state.number === 9 && state.inputs.metal === 'Na' && state.inputs.medium === 'dilute_HCl')
        return reject('dangerous_combination');
      // Validate measured values before any trial starts; invalid trials cannot advance.
      try {
        const projection = calculateHandbook(state.number, state.inputs);
        if (state.number === 3 && action.id === 'zero_balance')
          next.inputs = { ...state.inputs, sliders: 0 };
        next.step++;
        if (next.step === spec.steps.length) next.result = projection;
      } catch {
        return reject('invalid_input');
      }
      break;
    }
    case 'record':
      if (!state.result) return reject('no_result');
      if (state.recorded) return reject('wrong_order');
      next.trials = [...state.trials, { inputs: { ...state.inputs }, result: state.result }];
      next.recorded = true;
      break;
    case 'next_trial':
      if (!state.result || !state.recorded) return reject('wrong_order');
      next = {
        ...initialHandbookRun(state.number),
        safety: state.safety,
        trials: state.trials,
        notes: state.notes,
        inputs: { ...state.inputs },
        events: state.events,
      };
      break;
    case 'finish': {
      if (
        !state.recorded ||
        !state.trials.length ||
        ([6, 14, 19, 20].includes(state.number) && state.trials.length < 3)
      )
        return reject('no_result');
      if ([19, 20].includes(state.number)) {
        const titres = state.trials
          .slice(-3)
          .map((t) => Number(t.inputs.final_burette) - Number(t.inputs.initial_burette));
        if (Math.max(...titres) - Math.min(...titres) >= 0.1 - 1e-10)
          return reject('inconsistent_trials');
      }
      next.completed = true;
      break;
    }
  }
  next.sequence = state.sequence + 1;
  next.events = [...state.events, { sequence: state.sequence, action: { ...action } }];
  return { accepted: true, state: next };
}
