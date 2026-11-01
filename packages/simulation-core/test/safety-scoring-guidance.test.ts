import type { SimulationState } from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildReport,
  guidanceFor,
  paramNumber,
  predictErrors,
  recommendGuidanceLevel,
  replay,
  verifyEventStream,
  visibleFeedback,
} from '../src';
import {
  act,
  canonicalUntil,
  cm3,
  ctx,
  doStep,
  errorCodes,
  g,
  go,
  start,
  STARTED_ON,
} from './helpers';

const touch = { type: 'add_solid' as const, mass: g(26.5), handContact: true };

describe('safety violations are separate from technique errors', () => {
  it('guided beginner (confirm policy): unsafe action needs acknowledgement, no mutation until then', () => {
    const s = canonicalUntil(start({ mode: 'guided', guidanceLevel: 'beginner' }), 'add_solid');
    const blocked = act(s, touch);
    expect(blocked.events[0]?.rejectionCode).toBe('safety_acknowledgement_required');
    expect(blocked.state.lab).toEqual(s.lab);
    expect(blocked.feedback[0]?.severity).toBe('safety');

    const done = act(s, touch, { ack: true });
    expect(done.events[0]?.accepted).toBe(true);
    expect(done.events[0]?.errors.map((e) => [e.code, e.category])).toEqual([
      ['CHEMICAL_SKIN_CONTACT', 'safety_violation'],
    ]);
    expect(done.state.lab.watchGlass.solid).toEqual(g(26.5)); // the action itself still happened
  });

  it('manual (warn policy): performed immediately with an always-visible safety warning', () => {
    const s = canonicalUntil(start(), 'add_solid');
    const r = act(s, touch);
    expect(r.events[0]?.accepted).toBe(true);
    const warning = r.feedback.find((f) => f.errorCode === 'CHEMICAL_SKIN_CONTACT');
    expect(warning).toMatchObject({ severity: 'safety', visibility: 'always' });
    expect(visibleFeedback(r.feedback, r.state, ctx)).toContainEqual(warning);
  });

  it('starting lab work without the safety checklist records SAFETY_NOT_CONFIRMED once', () => {
    let s = go(start(), {
      type: 'select_apparatus',
      apparatusIds: [
        'volumetric_flask_250',
        'watch_glass',
        'funnel',
        'four_beam_balance',
        'wash_bottle',
      ],
    });
    s = go(s, { type: 'clean_glassware', apparatusIds: ['volumetric_flask_250'] });
    s = go(s, { type: 'clean_glassware', apparatusIds: ['watch_glass'] });
    expect(errorCodes(s)).toEqual(['SAFETY_NOT_CONFIRMED']);
    expect(s.lab.stage).toBe('setup');
  });

  it('an incomplete checklist records SAFETY_CHECKLIST_INCOMPLETE', () => {
    const s = go(start(), { type: 'confirm_safety', checklistItemIds: ['read_procedure'] });
    expect(errorCodes(s)).toEqual(['SAFETY_CHECKLIST_INCOMPLETE']);
  });

  it('safety deductions land only in the safety category', () => {
    const s = canonicalUntil(go(canonicalUntil(start(), 'add_solid'), touch), 'end', ['add_solid']);
    const report = buildReport(s, ctx);
    const byCat = Object.fromEntries(
      report.categories.map((c) => [c.category, c.deductions.map((d) => d.reason)]),
    );
    expect(byCat.safety).toEqual(['CHEMICAL_SKIN_CONTACT']);
    expect(byCat.technique).toEqual([]);
  });

  it('holding the flask by its body is a technique error, not a safety violation', () => {
    const s = go(canonicalUntil(start(), 'dissolve_solute'), {
      type: 'dissolve_solute',
      grip: 'body',
    });
    expect(s.events.at(-1)?.errors.map((e) => e.category)).toEqual(['technique_error']);
  });
});

describe('scoring evidence', () => {
  const multi = (() => {
    let s = go(start(), { type: 'confirm_safety', checklistItemIds: [] });
    s = canonicalUntil(s, 'transfer_solid');
    s = go(s, { type: 'transfer_solid', fractionIntoFunnel: 0.95, handContact: false });
    s = go(s, { type: 'request_hint' });
    s = canonicalUntil(s, 'adjust_to_mark');
    s = go(s, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'below' });
    return go(s, { type: 'submit_experiment' });
  })();
  const report = buildReport(multi, ctx);

  it('every deduction references existing events that evidence it', () => {
    const bySeq = new Map(multi.events.map((e) => [e.seq, e]));
    const all = report.categories.flatMap((c) => c.deductions);
    expect(all.length).toBeGreaterThan(3);
    for (const d of all) {
      expect(d.eventSeqs.length).toBeGreaterThan(0);
      for (const seq of d.eventSeqs) expect(bySeq.has(seq), `${d.reason} → ${seq}`).toBe(true);
      if (d.reason === d.reason.toUpperCase())
        expect(bySeq.get(d.eventSeqs[0] ?? -1)?.errors.some((e) => e.code === d.reason)).toBe(true);
      expect(d.parameterIds.length).toBeGreaterThan(0);
    }
  });

  it('uses the provisional deduction parameters from assessment.v1.json', () => {
    const tech = report.categories.find((c) => c.category === 'technique');
    const incomplete = tech?.deductions.find((d) => d.reason === 'INCOMPLETE_TRANSFER');
    expect(incomplete?.points).toBe(paramNumber(ctx, 'param.deduction_incomplete_transfer'));
    expect(incomplete?.parameterIds).toEqual(['param.deduction_incomplete_transfer']);
  });

  it('separates categories and reports concentration error evidence', () => {
    const reasons = (cat: string) =>
      report.categories.find((c) => c.category === cat)?.deductions.map((d) => d.reason);
    expect(reasons('safety')).toEqual(['SAFETY_CHECKLIST_INCOMPLETE']);
    expect(reasons('technique')).toEqual(['INCOMPLETE_TRANSFER', 'INSUFFICIENT_MIXING']); // submitted unmixed
    expect(reasons('measurement')).toEqual([
      'EYE_LEVEL_INCORRECT',
      'concentration_out_of_tolerance',
    ]);
    expect(reasons('completeness')).toEqual(['LABEL_MISSING']);
    expect(reasons('independence')).toEqual(['hint_used']);
    expect(report.measurements.relativeError).toBeLessThan(-0.01);
  });

  it('labels the result and never exceeds 0–100', () => {
    expect(report.resultLabel).toBe('practical competency estimate');
    expect(report.disclaimerKey).toBe('assessment.exp04.disclaimer');
    for (const c of report.categories) expect(c.score).toBeGreaterThanOrEqual(0);
    expect(report.overall).toBeLessThan(100);
  });

  it('a perfect manual run scores 100 overall', () => {
    expect(buildReport(canonicalUntil(start(), 'end'), ctx).overall).toBe(100);
  });

  it('an invalid volume reports concentration as unavailable with a deduction', () => {
    const s0 = canonicalUntil(start(), 'add_dissolution_water');
    const s = go(go(s0, { type: 'add_water', volume: cm3(230), source: 'distilled' }), {
      type: 'submit_experiment',
    });
    const r = buildReport(s, ctx);
    expect(r.measurements.achievedConcentration).toBeNull();
    expect(r.measurements.concentrationUnavailableReason).toBe('volume_invalid');
    expect(
      r.categories.find((c) => c.category === 'measurement')?.deductions.map((d) => d.reason),
    ).toContain('concentration_unavailable');
  });
});

describe('deterministic replay', () => {
  const init = {
    sessionId: 'test-session',
    mode: 'manual' as const,
    guidanceLevel: null,
    seed: 31,
    startedOn: STARTED_ON,
  };
  const s = (() => {
    let x = canonicalUntil(start({ seed: 31 }), 'adjust_to_mark');
    x = go(x, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'above' });
    return canonicalUntil(x, 'end');
  })();

  it('replaying the envelopes reproduces the state and the report exactly', () => {
    const replayed = replay(
      init,
      s.events.map((e) => e.envelope),
      ctx,
    );
    expect(replayed).toEqual(s);
    expect(buildReport(replayed, ctx)).toEqual(buildReport(s, ctx));
  });

  it('verifies an untampered event stream', () => {
    expect(verifyEventStream(init, s.events, ctx).ok).toBe(true);
  });

  it('detects a tampered action', () => {
    const tampered = s.events.map((e) =>
      e.envelope.action.type === 'adjust_to_mark'
        ? {
            ...e,
            envelope: {
              ...e.envelope,
              action: { ...e.envelope.action, eyeLevel: 'level' as const },
            },
          }
        : e,
    );
    const result = verifyEventStream(init, tampered, ctx);
    expect(result).toMatchObject({ ok: false, field: 'fingerprintAfter' });
  });

  it('detects a different seed', () => {
    expect(verifyEventStream({ ...init, seed: 32 }, s.events, ctx).ok).toBe(false);
  });
});

describe('guidance profiles (same engine, different prompts)', () => {
  const at = (over: Parameters<typeof start>[0]) =>
    canonicalUntil(start(over), 'weigh_watch_glass');

  it('automatic narrates the instruction and supplies the next action', () => {
    const gd = guidanceFor(at({ mode: 'automatic' }), ctx);
    expect(gd.promptKey).toBe('exp04.step.weigh_watch_glass.instruction');
    expect(gd.nextAction).toEqual({ type: 'weigh_watch_glass' });
  });

  it('beginner gets explicit instructions and confirmation of predicted errors', () => {
    const gd = guidanceFor(at({ mode: 'guided', guidanceLevel: 'beginner' }), ctx);
    expect(gd).toMatchObject({
      promptKey: 'exp04.step.weigh_watch_glass.instruction',
      confirmPredictedErrors: true,
      safetyPolicy: 'confirm',
    });
  });

  it('intermediate gets a hint question', () => {
    expect(guidanceFor(at({ mode: 'guided', guidanceLevel: 'intermediate' }), ctx).promptKey).toBe(
      'exp04.step.weigh_watch_glass.hint',
    );
  });

  it('advanced gets only the stage goal', () => {
    expect(guidanceFor(at({ mode: 'guided', guidanceLevel: 'advanced' }), ctx).promptKey).toBe(
      'exp04.stage.setup.goal',
    );
  });

  it('manual has no procedural prompt and hides procedural feedback but not safety or rejections', () => {
    const s = canonicalUntil(start(), 'add_dissolution_water');
    const gd = guidanceFor(s, ctx);
    expect(gd.promptKey).toBeNull();
    const r = act(s, { type: 'add_water', volume: cm3(10), source: 'tap' });
    expect(r.feedback.some((f) => f.errorCode === 'TAP_WATER_USED')).toBe(true);
    expect(
      visibleFeedback(r.feedback, r.state, ctx).some((f) => f.errorCode === 'TAP_WATER_USED'),
    ).toBe(false);
    expect(errorCodes(r.state)).toContain('TAP_WATER_USED'); // still recorded for the report
  });

  it('guidance never changes chemistry: the same actions give identical lab states in every mode', () => {
    const run = (over: Parameters<typeof start>[0]) => {
      let x = canonicalUntil(start({ ...over, seed: 3 }), 'transfer_solid');
      x = go(x, { type: 'transfer_solid', fractionIntoFunnel: 0.9, handContact: false });
      return canonicalUntil(x, 'end').lab;
    };
    const manual = run({ mode: 'manual' });
    expect(run({ mode: 'guided', guidanceLevel: 'beginner' })).toEqual(manual);
    expect(run({ mode: 'guided', guidanceLevel: 'advanced' })).toEqual(manual);
  });

  it('predictErrors is a pure dry run', () => {
    const s = canonicalUntil(
      start({ mode: 'guided', guidanceLevel: 'beginner' }),
      'add_dissolution_water',
    );
    const env = {
      action: { type: 'add_water' as const, volume: cm3(10), source: 'tap' as const },
      actor: 'student' as const,
      elapsedMs: 10 ** 7,
      acknowledgedSafetyWarning: false,
    };
    const snapshot = JSON.parse(JSON.stringify(s)) as SimulationState;
    expect(predictErrors(s, env, ctx)).toEqual(['TAP_WATER_USED']);
    expect(s).toEqual(snapshot);
  });

  it('recommends less support after a clean run of student actions', () => {
    const s = canonicalUntil(
      start({ mode: 'guided', guidanceLevel: 'intermediate' }),
      'transfer_solid',
    );
    const rec = recommendGuidanceLevel(s, ctx);
    expect(rec).toMatchObject({ recommended: 'advanced', reason: 'less_support' });
    expect(rec.evidenceSeqs).toHaveLength(paramNumber(ctx, 'param.adapt_clean_actions_to_step_up'));
  });

  it('recommends more support after repeated errors, citing the erroneous events', () => {
    let s = canonicalUntil(
      start({ mode: 'guided', guidanceLevel: 'intermediate' }),
      'transfer_solid',
    );
    s = go(s, { type: 'stopper_flask', inserted: true }); // rejected: funnel in place
    s = go(s, { type: 'transfer_solid', fractionIntoFunnel: 0.8, handContact: false });
    const rec = recommendGuidanceLevel(s, ctx);
    expect(rec).toMatchObject({ recommended: 'beginner', reason: 'more_support' });
    expect(rec.evidenceSeqs).toEqual(s.events.slice(-2).map((e) => e.seq));
  });

  it('keeps the top level and does not apply outside guided mode', () => {
    const adv = canonicalUntil(
      start({ mode: 'guided', guidanceLevel: 'advanced' }),
      'transfer_solid',
    );
    expect(recommendGuidanceLevel(adv, ctx).reason).toBe('keep');
    expect(recommendGuidanceLevel(start(), ctx).reason).toBe('not_guided');
  });

  it('beginner confirms safety steps but the engine is unchanged (doStep works in every profile)', () => {
    for (const over of [
      { mode: 'automatic' as const },
      { mode: 'guided' as const, guidanceLevel: 'beginner' as const },
    ])
      expect(doStep(start(over), 'confirm_safety').lab.safetyConfirmed).toBe(true);
  });
});
