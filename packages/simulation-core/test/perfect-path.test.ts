import { describe, expect, it } from 'vitest';
import {
  achievedConcentration,
  buildReport,
  convert,
  createInitialState,
  paramRange,
  runAutomatic,
  transition,
} from '../src';
import {
  canonicalUntil,
  ctx,
  errorCodes,
  expectedConcentration,
  start,
  STARTED_ON,
} from './helpers';

describe('Experiment 4 calculation (handbook PDF p.29)', () => {
  const e = ctx.definition.expectedResults;

  it('n = c × V = 1 mol dm-3 × 0.250 dm3 = 0.25 mol', () => {
    const c = convert(e.targetConcentration.quantity, 'mol dm-3').value;
    const v = convert(e.targetVolume.quantity, 'dm3').value;
    expect(c * v).toBe(e.requiredAmount.quantity.value);
    expect(c * v).toBe(0.25);
  });

  it('m = n × M = 0.25 mol × 106 g mol-1 = 26.5 g', () => {
    const molarMass = ctx.definition.chemicals.find((c) => c.id === e.soluteChemicalId)?.molarMass;
    expect(molarMass?.quantity).toEqual({ value: 106, unit: 'g mol-1' });
    expect(e.requiredAmount.quantity.value * (molarMass?.quantity.value ?? NaN)).toBe(
      e.targetMass.quantity.value,
    );
  });
});

describe('perfect guided run', () => {
  const final = canonicalUntil(start({ mode: 'guided', guidanceLevel: 'beginner' }), 'end');

  it('completes with no recorded errors', () => {
    expect(final.lab.submitted).toBe(true);
    expect(final.lab.stage).toBe('complete');
    expect(errorCodes(final)).toEqual([]);
    expect(final.events.every((e) => e.accepted)).toBe(true);
  });

  it('transfers the full 26.5 g into a 250 cm3 final volume', () => {
    expect(final.lab.transfer.weighedMass).toEqual({ value: 26.5, unit: 'g' });
    const transferred =
      final.lab.flask.soluteDissolved.value + final.lab.flask.soluteUndissolved.value;
    expect(transferred).toBeCloseTo(26.5, 12);
    expect(final.lab.flask.finalVolume).toEqual({ value: 250, unit: 'cm3' });
  });

  it('calculates 1 mol dm-3 from simulated mass and volume (not a hard-coded value)', () => {
    const c = achievedConcentration(final.lab, ctx.definition);
    expect(c.value?.unit).toBe('mol dm-3');
    expect(c.value?.value).toBeCloseTo(expectedConcentration(26.5, 250), 12);
    expect(c.value?.value).toBeCloseTo(1, 12);
  });

  it('records the solution as valid, homogeneous and correctly labelled', () => {
    expect(final.lab.risks).toEqual({
      purity: [],
      homogeneity: 'homogeneous',
      volumeValidity: 'valid',
    });
    expect(final.lab.restartRequired).toBe(false);
    expect(final.lab.label).toEqual({
      solutionName: 'Na2CO3',
      concentration: { value: 1, unit: 'mol dm-3' },
      preparationDate: STARTED_ON,
    });
  });

  it('follows the handbook order: weigh, transfer, rinse, dissolve, make up, mix, label', () => {
    const order = final.events.map((e) => e.envelope.action.type);
    const idx = (t: string) => order.indexOf(t as never);
    expect(idx('weigh_watch_glass')).toBeLessThan(idx('set_balance_sliders'));
    expect(idx('set_balance_sliders')).toBeLessThan(idx('add_solid'));
    expect(idx('add_solid')).toBeLessThan(idx('transfer_solid'));
    expect(idx('transfer_solid')).toBeLessThan(idx('rinse_watch_glass'));
    expect(idx('rinse_funnel')).toBeLessThan(idx('dissolve_solute'));
    expect(idx('dissolve_solute')).toBeLessThan(idx('adjust_to_mark'));
    expect(idx('adjust_to_mark')).toBeLessThan(idx('mix_solution'));
    expect(idx('mix_solution')).toBeLessThan(idx('apply_label'));
  });

  it('report shows a full-marks practical competency estimate except guided-support independence', () => {
    const report = buildReport(final, ctx);
    expect(report.resultLabel).toBe('practical competency estimate');
    const score = Object.fromEntries(report.categories.map((c) => [c.category, c.score]));
    expect(score).toEqual({
      safety: 100,
      technique: 100,
      measurement: 100,
      completeness: 100,
      independence: 70,
    });
    expect(report.measurements.relativeError).toBeCloseTo(0, 12);
  });
});

describe('automatic mode', () => {
  const demo = runAutomatic(start({ mode: 'automatic' }), ctx);

  it('replays the canonical procedure through the same engine as system actions', () => {
    expect(demo.lab.submitted).toBe(true);
    expect(demo.events.every((e) => e.actor === 'system' && e.accepted)).toBe(true);
    expect(achievedConcentration(demo.lab, ctx.definition).value?.value).toBeCloseTo(1, 12);
  });

  it('does not assess independence for a demonstration', () => {
    const independence = buildReport(demo, ctx).categories.find(
      (c) => c.category === 'independence',
    );
    expect(independence?.score).toBeNull();
  });
});

describe('seeded determinism', () => {
  const init = {
    sessionId: 's',
    mode: 'manual' as const,
    guidanceLevel: null,
    seed: 7,
    startedOn: STARTED_ON,
  };

  it('the same seed gives an identical initial state; seeds change the watch-glass mass', () => {
    expect(createInitialState(init, ctx)).toEqual(createInitialState(init, ctx));
    const masses = [1, 2, 3, 4, 5].map(
      (seed) => createInitialState({ ...init, seed }, ctx).lab.watchGlass.tareMass.value,
    );
    expect(new Set(masses).size).toBeGreaterThan(1);
    const range = paramRange(ctx, ctx.assessment.bindings.watchGlassMassRange);
    for (const m of masses) {
      expect(m).toBeGreaterThanOrEqual(range.min);
      expect(m).toBeLessThanOrEqual(range.max);
    }
  });

  it('the same state, action, definition and seed always produce identical output', () => {
    const s = canonicalUntil(start({ seed: 99 }), 'adjust_to_mark');
    const env = {
      action: {
        type: 'adjust_to_mark' as const,
        source: 'distilled' as const,
        eyeLevel: 'above' as const,
      },
      actor: 'student' as const,
      elapsedMs: 999_999,
      acknowledgedSafetyWarning: false,
    };
    expect(transition(s, env, ctx)).toEqual(transition(s, env, ctx));
  });

  it('a perfect run reaches the same concentration for any seed', () => {
    for (const seed of [0, 1, 123456, 0xffffffff]) {
      const s = canonicalUntil(start({ seed }), 'end');
      expect(achievedConcentration(s.lab, ctx.definition).value?.value).toBeCloseTo(1, 12);
    }
  });
});
