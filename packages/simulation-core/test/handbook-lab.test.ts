import { describe, expect, it } from 'vitest';
import {
  calculateHandbook,
  handbookModels,
  initialHandbookRun,
  transitionHandbook,
  type HandbookAction,
  type HandbookRun,
} from '../src/handbookLab';

function apply(state: HandbookRun, action: HandbookAction): HandbookRun {
  const next = transitionHandbook(state, action, state.sequence);
  if (!next.accepted) throw new Error(`${state.number}/${action.type}: ${next.error}`);
  return next.state;
}
function trial(state: HandbookRun): HandbookRun {
  if (!state.safety) state = apply(state, { type: 'safety', value: true });
  for (const id of handbookModels.get(state.number)!.steps)
    state = apply(state, { type: 'step', id });
  return apply(state, { type: 'record' });
}
const value = (state: HandbookRun, label: string) =>
  state.result!.readings.find((r) => r.label === `labs.reading.${label}`)!.value;

describe('independent handbook teaching models', () => {
  it('registers precisely the other 19 practicals without replacing Experiment 4', () => {
    expect([...handbookModels.keys()]).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1).filter((n) => n !== 4),
    );
    expect(() => initialHandbookRun(4)).toThrow();
  });
  it.each([...handbookModels.keys()])(
    'runs practical %i through procedures, records and replay',
    (number) => {
      let state = trial(initialHandbookRun(number));
      if ([6, 14, 19, 20].includes(number)) {
        expect(transitionHandbook(state, { type: 'finish' }, state.sequence)).toMatchObject({
          accepted: false,
          error: 'no_result',
        });
        state = trial(apply(state, { type: 'next_trial' }));
        state = trial(apply(state, { type: 'next_trial' }));
      }
      state = apply(state, { type: 'notes', value: 'Exact learner text\nසිංහල 123' });
      state = apply(state, { type: 'finish' });
      const events = JSON.parse(JSON.stringify(state.events)) as HandbookRun['events'];
      let replay = initialHandbookRun(number);
      for (const event of events) replay = apply(replay, event.action);
      expect(replay).toEqual(state);
      expect(state.completed).toBe(true);
      expect(state.result).not.toBeNull();
      for (const r of state.result!.readings) expect(Number.isFinite(r.value)).toBe(true);
      expect(transitionHandbook(state, { type: 'record' }, state.sequence)).toMatchObject({
        accepted: false,
        error: 'completed',
      });
    },
  );
  it('enforces safety, sequence, version, procedure order and immutable rejection', () => {
    const state = initialHandbookRun(7);
    expect(transitionHandbook(state, { type: 'step', id: 'insulate' }, 0)).toMatchObject({
      accepted: false,
      state,
      error: 'safety_required',
    });
    expect(transitionHandbook(state, { type: 'safety', value: true }, 1)).toMatchObject({
      accepted: false,
      error: 'stale_sequence',
    });
    expect(
      transitionHandbook({ ...state, version: 'bad' as '1.0.0' }, { type: 'finish' }, 0),
    ).toMatchObject({ accepted: false, error: 'unsupported' });
    const safe = apply(state, { type: 'safety', value: true });
    expect(transitionHandbook(safe, { type: 'step', id: 'mix' }, safe.sequence)).toMatchObject({
      accepted: false,
      error: 'wrong_order',
    });
    expect(state.sequence).toBe(0);
    expect(state.safety).toBe(false);
  });
  it.each([NaN, Infinity, -1, 1001])('rejects invalid volume %s', (volume) => {
    const state = initialHandbookRun(5);
    expect(
      transitionHandbook(state, { type: 'input', id: 'gas_volume', value: volume }, 0),
    ).toMatchObject({ accepted: false, error: 'invalid_input' });
  });
  it('blocks the dangerous sodium/acid combination', () => {
    let state = initialHandbookRun(9);
    state = apply(state, { type: 'input', id: 'medium', value: 'dilute_HCl' });
    state = apply(state, { type: 'safety', value: true });
    expect(
      transitionHandbook(state, { type: 'step', id: 'prepare_sample' }, state.sequence),
    ).toMatchObject({ accepted: false, error: 'dangerous_combination' });
  });
  it('permits balance rider adjustment only after loading, and resets zero', () => {
    let state = initialHandbookRun(3);
    state = apply(state, { type: 'input', id: 'sliders', value: 9 });
    state = apply(state, { type: 'safety', value: true });
    state = apply(state, { type: 'step', id: 'inspect_glassware' });
    state = apply(state, { type: 'step', id: 'zero_balance' });
    expect(state.inputs.sliders).toBe(0);
    expect(
      transitionHandbook(state, { type: 'input', id: 'sliders', value: 5 }, state.sequence),
    ).toMatchObject({ accepted: false, error: 'wrong_order' });
    state = apply(state, { type: 'step', id: 'load_pan' });
    state = apply(state, { type: 'input', id: 'sliders', value: 5 });
    state = apply(state, { type: 'step', id: 'read_balance' });
    expect(state.result!.observation).toBe('labs.observation.balance_equal');
    expect(value(state, 'difference')).toBe(0);
  });
  it('corrects wet gas to dry STP volume and rejects physically invalid readings', () => {
    const inputs = initialHandbookRun(5).inputs;
    const result = calculateHandbook(5, inputs);
    expect(result.readings[0]!.value).toBeCloseTo(736.2, 8);
    const volume = (0.375 * (736.2 / 760) * 273.15) / 298.15;
    expect(result.readings.find((r) => r.label.endsWith('.molar_volume'))!.value).toBeCloseTo(
      volume / (0.5 / 32),
      8,
    );
    expect(() => calculateHandbook(5, { ...inputs, mass_after: 6 })).toThrow();
    expect(() => calculateHandbook(5, { ...inputs, temperature: 25.5 })).toThrow();
    expect(() => calculateHandbook(5, { ...inputs, pressure: 10 })).toThrow();
    const mg = trial(initialHandbookRun(6));
    const moles = (((736.2 * 101000) / 760) * 0.00005) / (8.314 * 298.15);
    expect(value(mg, 'molar_mass')).toBeCloseTo(0.05 / moles, 8);
  });
  it('separates authorized synthetic calorimetry from entered readings', () => {
    const practice = trial(initialHandbookRun(7));
    expect(practice.inputs.data_mode).toBe('practice_dataset');
    expect(value(practice, 'final_temperature')).toBe(38);
    expect(value(practice, 'enthalpy')).toBeCloseTo(-54.6);
    const entered = calculateHandbook(7, {
      ...practice.inputs,
      data_mode: 'entered_readings',
      initial_acid: 24,
      initial_base: 26,
      final_temperature: 35,
    });
    expect(entered.readings.find((r) => r.label.endsWith('.enthalpy'))!.value).toBeCloseTo(-42);
    const hess = trial(initialHandbookRun(8));
    expect(value(hess, 'path_difference')).toBe(0);
    expect(value(hess, 'rise_1')).toBeCloseTo(20);
    const own = calculateHandbook(8, {
      ...hess.inputs,
      data_mode: 'entered_readings',
      rise_a: 10,
      rise_b: 1,
      rise_c: 0,
      rise_d: 0,
    });
    expect(own.readings.find((r) => r.label.endsWith('.path_difference'))!.value).not.toBe(0);
  });
  it('calculates all three titration stoichiometries from entered volumes', () => {
    for (const [number, expected] of [
      [14, 0.5],
      [19, 0.1],
      [20, 0.02],
    ] as const) {
      const state = trial(initialHandbookRun(number));
      expect(value(state, 'concentration')).toBeCloseTo(expected);
      expect(() =>
        calculateHandbook(number, { ...state.inputs, initial_burette: 30, final_burette: 25 }),
      ).toThrow();
    }
  });
  it('requires strictly less than 0.1 cm³ spread for the last three redox titres', () => {
    let state = initialHandbookRun(20);
    for (const final of [25, 25.05, 25.1]) {
      state = apply(state, { type: 'input', id: 'final_burette', value: final });
      state = trial(state);
      if (final !== 25.1) state = apply(state, { type: 'next_trial' });
    }
    expect(transitionHandbook(state, { type: 'finish' }, state.sequence)).toMatchObject({
      accepted: false,
      error: 'inconsistent_trials',
    });
    state = trial(apply(state, { type: 'next_trial' }));
    expect(apply(state, { type: 'finish' }).completed).toBe(true);
  });
  it('covers every sample choice with a defined finite outcome', () => {
    for (const spec of handbookModels.values())
      for (const control of spec.controls)
        for (const option of control.options ?? []) {
          const input = { ...initialHandbookRun(spec.number).inputs, [control.id]: option };
          if (spec.number === 9 && input.metal === 'Na' && input.medium === 'dilute_HCl') {
            expect(() => calculateHandbook(9, input)).toThrow();
            continue;
          }
          const result = calculateHandbook(spec.number, input);
          expect(result.observation).not.toContain('undefined');
          for (const r of result.readings) expect(Number.isFinite(r.value)).toBe(true);
        }
    expect(
      calculateHandbook(13, { halide: 'Br-', halide_test: 'AgNO3_concentrated_NH3' }).observation,
    ).toBe('labs.observation.silver_dissolves');
    expect(
      calculateHandbook(13, { halide: 'I-', halide_test: 'AgNO3_concentrated_NH3' }).observation,
    ).toBe('labs.observation.silver_iodide');
    expect(calculateHandbook(16, { cation: 'Ca2+', anion_salt: 'SO4^2-' }).observation).toBe(
      'labs.observation.solubility_SS',
    );
    expect(calculateHandbook(16, { cation: 'Ba2+', anion_salt: 'SO4^2-' }).observation).toBe(
      'labs.observation.solubility_IS',
    );
  });
});
