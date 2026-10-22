import type { SimulationState } from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import { achievedConcentration, buildReport, paramNumber, paramRange } from '../src';
import {
  act,
  canonicalUntil,
  cm3,
  ctx,
  errorCodes,
  expectedConcentration,
  g,
  go,
  start,
} from './helpers';

const conc = (s: SimulationState) => achievedConcentration(s.lab, ctx.definition);
const transferred = (s: SimulationState) =>
  s.lab.flask.soluteDissolved.value + s.lab.flask.soluteUndissolved.value;
const param = (id: string) => paramNumber(ctx, id);
const errorEvent = (s: SimulationState, code: string) =>
  s.events.flatMap((e) => e.errors.map((x) => ({ e, x }))).find(({ x }) => x.code === code);

/** Every error path: the action is accepted, the state changes, and the error is recorded. */
const expectAcceptedWithError = (s: SimulationState, code: string) => {
  const found = errorEvent(s, code);
  expect(found, code).toBeDefined();
  expect(found?.e.accepted).toBe(true);
  expect(found?.x.sourceRefs.length).toBeGreaterThan(0);
};

describe('1. wrong mass', () => {
  const beforeAdd = canonicalUntil(start(), 'add_solid');
  const s1 = go(beforeAdd, { type: 'add_solid', mass: g(25), handContact: false });
  // The student ignores the pointer and moves on with 25 g on the watch glass.
  const s = canonicalUntil(s1, 'end', ['add_solid']);

  it('the balance shows the pointer below zero, but the action is accepted', () => {
    const r = act(beforeAdd, { type: 'add_solid', mass: g(25), handContact: false });
    expect(r.events[0]?.observations).toContain('pointer_below_zero');
  });

  it('records MASS_OUT_OF_TOLERANCE at transfer as a measurement error', () => {
    expectAcceptedWithError(s, 'MASS_OUT_OF_TOLERANCE');
    expect(errorEvent(s, 'MASS_OUT_OF_TOLERANCE')?.x.category).toBe('measurement_error');
    expect(errorEvent(s, 'MASS_OUT_OF_TOLERANCE')?.e.envelope.action.type).toBe('transfer_solid');
  });

  it('changes the concentration numerically: c = (25 / 106) / 0.250', () => {
    expect(s.lab.transfer.weighedMass).toEqual(g(25));
    expect(conc(s).value?.value).toBeCloseTo(expectedConcentration(25, 250), 12);
    expect(conc(s).value?.value).toBeLessThan(1);
  });

  it('flags excess solid with the pointer above zero, and is correctable before transfer', () => {
    const over = act(beforeAdd, { type: 'add_solid', mass: g(27), handContact: false });
    expect(over.events[0]?.observations).toContain('pointer_above_zero');
    const fixed = go(over.state, { type: 'remove_solid', mass: g(0.5), handContact: false });
    const done = canonicalUntil(fixed, 'end');
    expect(errorCodes(done)).not.toContain('MASS_OUT_OF_TOLERANCE');
    expect(conc(done).value?.value).toBeCloseTo(1, 12);
  });
});

describe('2. wrong-capacity volumetric flask', () => {
  const s0 = canonicalUntil(start(), 'select_apparatus');
  const required = ['watch_glass', 'funnel', 'four_beam_balance', 'wash_bottle'];
  const wrong = go(s0, {
    type: 'select_apparatus',
    apparatusIds: ['volumetric_flask_500', ...required],
  });

  it('selecting the flask is accepted; the error is recorded only when solute goes in', () => {
    expect(wrong.lab.workingFlaskId).toBe('volumetric_flask_500');
    expect(wrong.lab.flask.capacity).toEqual(cm3(500));
    expect(errorCodes(wrong)).toEqual([]);
  });

  it('records WRONG_FLASK_CAPACITY and doubles the volume: c = (26.5 / 106) / 0.500', () => {
    const cleaned = go(wrong, {
      type: 'clean_glassware',
      apparatusIds: ['volumetric_flask_500', 'watch_glass', 'funnel'],
    });
    // The student keeps the 500 cm3 flask and otherwise follows the procedure.
    const s = canonicalUntil(cleaned, 'end', ['select_apparatus', 'clean_glassware']);
    expectAcceptedWithError(s, 'WRONG_FLASK_CAPACITY');
    expect(errorEvent(s, 'WRONG_FLASK_CAPACITY')?.x.consequence).toBe('numeric_volume');
    expect(s.lab.flask.finalVolume).toEqual(cm3(500));
    expect(conc(s).value?.value).toBeCloseTo(expectedConcentration(26.5, 500), 12);
    expect(conc(s).value?.value).toBeCloseTo(0.5, 12);
    expect(s.lab.risks.purity).toEqual([]); // capacity error is not a purity problem
  });

  it('is recoverable before transfer by selecting the 250 cm3 flask', () => {
    const fixed = canonicalUntil(wrong, 'end');
    expect(fixed.lab.workingFlaskId).toBe('volumetric_flask_250');
    expect(errorCodes(fixed)).not.toContain('WRONG_FLASK_CAPACITY');
  });
});

describe('3. dirty volumetric flask', () => {
  const s0 = canonicalUntil(start(), 'clean_glassware');
  const partlyClean = go(s0, { type: 'clean_glassware', apparatusIds: ['watch_glass', 'funnel'] });
  const s = canonicalUntil(partlyClean, 'end', ['clean_glassware']);

  it('records DIRTY_FLASK_USED as a purity/validity risk on the flask', () => {
    expectAcceptedWithError(s, 'DIRTY_FLASK_USED');
    expect(errorEvent(s, 'DIRTY_FLASK_USED')?.x.consequence).toBe('purity_risk');
    expect(s.lab.risks.purity).toEqual([
      { code: 'DIRTY_FLASK_USED', apparatusId: 'volumetric_flask_250' },
    ]);
    expect(s.lab.restartRequired).toBe(true);
  });

  it('does not invent a numeric concentration change', () => {
    expect(conc(s).value?.value).toBeCloseTo(1, 12);
    expect(errorCodes(s)).not.toContain('WRONG_FLASK_CAPACITY');
  });
});

describe('4. incomplete transfer', () => {
  const s0 = canonicalUntil(start(), 'transfer_solid');
  const r = act(s0, { type: 'transfer_solid', fractionIntoFunnel: 0.9, handContact: false });
  const s = canonicalUntil(r.state, 'end');

  it('spills part of the solid and reports the observation', () => {
    expect(r.events[0]?.observations).toContain('solid_spilled');
    expect(r.state.lab.transfer.spilled.value).toBeCloseTo(26.5 * 0.1, 12);
    expectAcceptedWithError(s, 'INCOMPLETE_TRANSFER');
  });

  it('decreases the transferred mass and the concentration', () => {
    expect(transferred(s)).toBeCloseTo(26.5 * 0.9, 10);
    expect(conc(s).value?.value).toBeCloseTo(expectedConcentration(26.5 * 0.9, 250), 12);
  });
});

describe('5. watch glass or funnel not rinsed', () => {
  const wgFrac = param('param.watch_glass_residue_fraction');
  const fFrac = param('param.funnel_residue_fraction');
  const beforeRinse = canonicalUntil(start(), 'rinse_watch_glass');

  it('watch glass not rinsed: provisional retained mass lowers the transferred mass', () => {
    const s = canonicalUntil(go(beforeRinse, { type: 'remove_funnel' }), 'end');
    expectAcceptedWithError(s, 'WATCH_GLASS_NOT_RINSED');
    expectAcceptedWithError(s, 'FUNNEL_NOT_RINSED');
    const wgResidue = 26.5 * wgFrac;
    const funnelResidue = (26.5 - wgResidue) * fFrac;
    expect(transferred(s)).toBeCloseTo(26.5 - wgResidue - funnelResidue, 10);
    expect(errorEvent(s, 'WATCH_GLASS_NOT_RINSED')?.e.parameterIdsUsed).toContain(
      'param.watch_glass_residue_fraction',
    );
    expect(conc(s).value?.value).toBeLessThan(1);
  });

  it('only the funnel not rinsed: only the funnel residue is lost', () => {
    const rinsedWg = go(beforeRinse, { type: 'rinse_watch_glass', source: 'distilled' });
    const s = canonicalUntil(go(rinsedWg, { type: 'remove_funnel' }), 'end');
    expect(errorCodes(s)).toContain('FUNNEL_NOT_RINSED');
    expect(errorCodes(s)).not.toContain('WATCH_GLASS_NOT_RINSED');
    expect(transferred(s)).toBeCloseTo(26.5 - (26.5 - 26.5 * wgFrac) * fFrac, 10);
  });

  it('the retained mass is deterministic (same result for different seeds)', () => {
    const a = canonicalUntil(
      go(canonicalUntil(start({ seed: 1 }), 'rinse_watch_glass'), { type: 'remove_funnel' }),
      'end',
    );
    const b = canonicalUntil(
      go(canonicalUntil(start({ seed: 2 }), 'rinse_watch_glass'), { type: 'remove_funnel' }),
      'end',
    );
    expect(transferred(a)).toBe(transferred(b));
  });
});

describe('6. final dilution before complete dissolution', () => {
  const s0 = canonicalUntil(start(), 'add_dissolution_water');
  // Student skips dissolving and fills straight to the mark.
  const filled = go(s0, {
    type: 'add_water',
    volume: cm3(250 - s0.lab.flask.liquidVolume.value),
    source: 'distilled',
  });

  it('is accepted and records UNDISSOLVED_AT_MARK as a restart-required volume-validity error', () => {
    expectAcceptedWithError(filled, 'UNDISSOLVED_AT_MARK');
    expect(filled.lab.risks.volumeValidity).toBe('invalid');
    expect(filled.lab.restartRequired).toBe(true);
  });

  it('does not invent a numeric result', () => {
    expect(conc(filled)).toEqual({ value: null, unavailableReason: 'volume_invalid' });
  });

  it('later dissolution does not repair the volume', () => {
    let s = go(filled, { type: 'stopper_flask', inserted: true });
    s = go(s, { type: 'mix_solution', inversions: 20, grip: 'neck' });
    expect(s.lab.flask.soluteUndissolved.value).toBe(0);
    expect(s.lab.risks.volumeValidity).toBe('invalid');
    expect(conc(s).value).toBeNull();
  });
});

describe('7. tap water instead of distilled water', () => {
  const s0 = canonicalUntil(start(), 'add_dissolution_water');
  const tap = go(s0, { type: 'add_water', volume: cm3(80), source: 'tap' });
  const s = canonicalUntil(tap, 'end');

  it('records TAP_WATER_USED as a purity/validity risk requiring restart', () => {
    expectAcceptedWithError(s, 'TAP_WATER_USED');
    expect(s.lab.risks.purity).toEqual([{ code: 'TAP_WATER_USED', apparatusId: null }]);
    expect(s.lab.restartRequired).toBe(true);
  });

  it('does not change the calculated concentration', () => {
    expect(conc(s).value?.value).toBeCloseTo(1, 12);
  });

  it('is recorded once even if tap water is used repeatedly', () => {
    const twice = go(go(s0, { type: 'add_water', volume: cm3(10), source: 'tap' }), {
      type: 'add_water',
      volume: cm3(10),
      source: 'tap',
    });
    expect(errorCodes(twice).filter((c) => c === 'TAP_WATER_USED')).toHaveLength(1);
  });
});

describe('8. calibration-mark overshoot', () => {
  const s0 = canonicalUntil(start(), 'add_water_near_mark');
  const over = go(s0, {
    type: 'add_water',
    volume: cm3(250 - s0.lab.flask.liquidVolume.value + 5),
    source: 'distilled',
  });

  it('records OVERSHOOT_MARK, restart required', () => {
    expectAcceptedWithError(over, 'OVERSHOOT_MARK');
    expect(over.lab.restartRequired).toBe(true);
  });

  it('final volume exceeds 250 cm3 and concentration falls', () => {
    expect(over.lab.flask.finalVolume?.value).toBeCloseTo(255, 10);
    expect(conc(over).value?.value).toBeCloseTo(expectedConcentration(26.5, 255), 12);
    expect(conc(over).value?.value).toBeLessThan(1);
  });

  it('water cannot be removed: adjusting to the mark is now physically rejected', () => {
    const r = act(over, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'level' });
    expect(r.events[0]?.rejectionCode).toBe('below_mark');
    expect(r.state.lab).toEqual(over.lab);
  });

  it('adding water after a correct make-up is also an overshoot', () => {
    const madeUp = canonicalUntil(start(), 'stopper_for_mixing');
    const more = go(madeUp, { type: 'add_water', volume: cm3(2), source: 'distilled' });
    expect(errorCodes(more)).toContain('OVERSHOOT_MARK');
    expect(more.lab.flask.finalVolume?.value).toBeCloseTo(252, 10);
  });
});

describe('9. wrong eye level when judging the meniscus', () => {
  const range = paramRange(ctx, 'param.eye_level_volume_error');
  const s0 = canonicalUntil(start({ seed: 5 }), 'adjust_to_mark');
  const above = go(s0, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'above' });
  const below = go(s0, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'below' });

  it('records EYE_LEVEL_INCORRECT with the provisional parameter', () => {
    expectAcceptedWithError(above, 'EYE_LEVEL_INCORRECT');
    expect(errorEvent(above, 'EYE_LEVEL_INCORRECT')?.e.parameterIdsUsed).toContain(
      'param.eye_level_volume_error',
    );
  });

  it('applies a seeded volume error within the provisional range (above: over, below: under)', () => {
    const over = (above.lab.flask.finalVolume?.value ?? 0) - 250;
    const under = 250 - (below.lab.flask.finalVolume?.value ?? 0);
    for (const e of [over, under]) {
      expect(e).toBeGreaterThanOrEqual(range.min);
      expect(e).toBeLessThanOrEqual(range.max);
    }
    expect(conc(above).value?.value).toBeLessThan(1);
    expect(conc(below).value?.value).toBeGreaterThan(1);
  });

  it('is reproducible for a seed and varies across seeds', () => {
    const again = go(canonicalUntil(start({ seed: 5 }), 'adjust_to_mark'), {
      type: 'adjust_to_mark',
      source: 'distilled',
      eyeLevel: 'above',
    });
    expect(again.lab.flask.finalVolume).toEqual(above.lab.flask.finalVolume);
    const volumes = [11, 12, 13].map(
      (seed) =>
        go(canonicalUntil(start({ seed }), 'adjust_to_mark'), {
          type: 'adjust_to_mark',
          source: 'distilled',
          eyeLevel: 'above',
        }).lab.flask.finalVolume?.value,
    );
    expect(new Set(volumes).size).toBeGreaterThan(1);
  });

  it('eye level with the mark gives exactly 250 cm3', () => {
    const level = go(s0, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'level' });
    expect(level.lab.flask.finalVolume).toEqual(cm3(250));
  });
});

describe('10. insufficient final mixing', () => {
  const s0 = canonicalUntil(start(), 'mix_solution');
  const partial = go(s0, { type: 'mix_solution', inversions: 3, grip: 'neck' });

  it('partial mixing leaves a homogeneity risk; committing records INSUFFICIENT_MIXING', () => {
    expect(partial.lab.risks.homogeneity).toBe('partially_mixed');
    const submitted = go(go(partial, canonicalLabel(partial)), { type: 'submit_experiment' });
    expectAcceptedWithError(submitted, 'INSUFFICIENT_MIXING');
    expect(errorEvent(submitted, 'INSUFFICIENT_MIXING')?.x.consequence).toBe('homogeneity_risk');
    expect(conc(submitted).value?.value).toBeCloseTo(1, 12); // no numeric change
  });

  it('is recoverable by adequate mixing before submission', () => {
    const labelled = go(partial, canonicalLabel(partial));
    expect(labelled.lab.openErrors.map((e) => e.code)).toContain('INSUFFICIENT_MIXING');
    const mixed = go(labelled, { type: 'mix_solution', inversions: 7, grip: 'neck' });
    expect(mixed.lab.risks.homogeneity).toBe('homogeneous');
    expect(mixed.lab.openErrors).toEqual([]);
    expect(mixed.events.at(-1)?.resolvedErrors.map((r) => r.code)).toEqual(['INSUFFICIENT_MIXING']);
    const deduction = buildReport(go(mixed, { type: 'submit_experiment' }), ctx).categories.find(
      (c) => c.category === 'technique',
    )?.deductions[0];
    expect(deduction?.resolved).toBe(true);
    expect(deduction?.points).toBe(15 * param('param.recovered_error_factor'));
  });
});

function canonicalLabel(s: SimulationState) {
  return {
    type: 'apply_label' as const,
    solutionName: 'Na2CO3',
    concentration: { value: 1, unit: 'mol dm-3' as const },
    preparationDate: s.meta.startedOn,
  };
}

describe('11. missing or incorrect label', () => {
  const s0 = canonicalUntil(start(), 'apply_label');

  it('missing label: completion error at submission, concentration unchanged', () => {
    const s = go(s0, { type: 'submit_experiment' });
    expectAcceptedWithError(s, 'LABEL_MISSING');
    expect(errorEvent(s, 'LABEL_MISSING')?.x.category).toBe('completion_error');
    expect(conc(s).value?.value).toBeCloseTo(1, 12);
  });

  it.each([
    ['wrong name', { solutionName: 'NaOH' }],
    ['missing concentration', { concentration: null }],
    ['wrong concentration', { concentration: { value: 0.5, unit: 'mol dm-3' as const } }],
    ['wrong unit dimension', { concentration: { value: 1, unit: 'g' as const } }],
    ['missing date', { preparationDate: null }],
    ['wrong date', { preparationDate: '2026-01-01' }],
  ])('incorrect label (%s) records LABEL_INCORRECT', (_name, patch) => {
    const s = go(s0, { ...canonicalLabel(s0), ...patch });
    expectAcceptedWithError(s, 'LABEL_INCORRECT');
    expect(conc(s).value?.value).toBeCloseTo(1, 12);
  });

  it('accepts equivalent names (sodium carbonate, Na₂CO₃)', () => {
    for (const solutionName of [
      'sodium carbonate',
      'Na₂CO₃',
      'Anhydrous Sodium Carbonate',
      'සෝඩියම් කාබනේට්',
      'නිර්ජලීය සෝඩියම් කාබනේට්',
    ])
      expect(errorCodes(go(s0, { ...canonicalLabel(s0), solutionName }))).toEqual([]);
  });

  it('is recoverable by relabelling correctly', () => {
    const wrong = go(s0, { ...canonicalLabel(s0), solutionName: 'NaCl' });
    const fixed = go(wrong, canonicalLabel(wrong));
    expect(fixed.lab.openErrors).toEqual([]);
    expect(fixed.events.at(-1)?.resolvedErrors.map((r) => r.code)).toEqual(['LABEL_INCORRECT']);
  });
});

describe('consistency edge cases', () => {
  it('rinse water entering a flask already at the mark is an overshoot', () => {
    const made = canonicalUntil(start(), 'stopper_for_mixing');
    let s = go(made, { type: 'place_funnel' });
    s = go(s, { type: 'rinse_funnel', source: 'distilled' });
    expect(errorCodes(s)).toContain('OVERSHOOT_MARK');
    expect(s.lab.flask.finalVolume?.value).toBeCloseTo(250 + param('param.rinse_volume'), 10);
  });

  it('solid transferred into a flask already made up invalidates the volume', () => {
    let s = canonicalUntil(start(), 'place_funnel');
    s = go(s, { type: 'add_water', volume: cm3(250), source: 'distilled' });
    expect(s.lab.risks.volumeValidity).toBe('valid'); // water only, no solute yet
    s = go(s, { type: 'place_funnel' });
    s = go(s, { type: 'transfer_solid', fractionIntoFunnel: 1, handContact: false });
    expect(errorCodes(s)).toContain('UNDISSOLVED_AT_MARK');
    expect(s.lab.risks.volumeValidity).toBe('invalid');
    expect(conc(s).value).toBeNull();
  });
});

describe('12. submission with no solute in the flask (zero-solute amendment)', () => {
  const setup = () => {
    let s = canonicalUntil(start(), 'weigh_watch_glass'); // safety, apparatus selected, glassware clean
    s = go(s, { type: 'add_water', volume: cm3(250), source: 'distilled' });
    return s;
  };

  it('accepts the submission, keeps c = 0 mol dm-3 and records one restart-required completion error', () => {
    const made = setup();
    expect(made.lab.flask.madeUp).toBe(true);
    const r = act(made, { type: 'submit_experiment' });
    expect(r.events[0]?.accepted).toBe(true);
    const s = r.state;
    expect(conc(s).value).toEqual({ value: 0, unit: 'mol dm-3' });
    const incomplete = r.events[0]?.errors.filter((e) => e.code === 'INCOMPLETE_PROCEDURE') ?? [];
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]).toMatchObject({
      category: 'completion_error',
      recoverability: 'restart_required',
    });
    expect(s.lab.restartRequired).toBe(true);
    const report = buildReport(s, ctx);
    const completeness = report.categories.find((c) => c.category === 'completeness');
    expect(completeness?.deductions.map((d) => d.reason)).toContain('INCOMPLETE_PROCEDURE');
    expect(completeness?.score).toBeLessThan(100);
    expect(report.measurements.achievedConcentration).toEqual({ value: 0, unit: 'mol dm-3' });
    expect(report.errorSummary.unresolved).toContainEqual(
      expect.objectContaining({ code: 'INCOMPLETE_PROCEDURE', recoverability: 'restart_required' }),
    );
    for (const cat of ['safety', 'technique', 'measurement'] as const)
      expect(
        report.categories.find((c) => c.category === cat)?.deductions.map((d) => d.reason),
      ).not.toContain('INCOMPLETE_PROCEDURE');
  });

  it('records the completion error once even when the concentration is also unavailable', () => {
    const s = go(canonicalUntil(start(), 'weigh_watch_glass'), { type: 'submit_experiment' });
    expect(conc(s).value).toBeNull();
    expect(errorCodes(s).filter((c) => c === 'INCOMPLETE_PROCEDURE')).toHaveLength(1);
  });

  it('a partial non-zero transfer follows the wrong-mass rules, not the zero-solute rule', () => {
    const s0 = canonicalUntil(
      go(canonicalUntil(start(), 'add_solid'), {
        type: 'add_solid',
        mass: g(10),
        handContact: false,
      }),
      'end',
      ['add_solid'],
    );
    expect(errorCodes(s0)).toContain('MASS_OUT_OF_TOLERANCE');
    expect(errorCodes(s0)).not.toContain('INCOMPLETE_PROCEDURE');
    expect(conc(s0).value?.value).toBeGreaterThan(0);
  });
});
