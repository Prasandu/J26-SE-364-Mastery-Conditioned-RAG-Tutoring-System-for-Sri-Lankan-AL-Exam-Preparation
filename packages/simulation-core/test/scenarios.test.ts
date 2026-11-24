import { readdirSync, readFileSync } from 'node:fs';
import {
  ActionSchema,
  CanonicalStepIdSchema,
  ErrorCodeSchema,
  SessionInitSchema,
  type SimulationState,
} from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  achievedConcentration,
  buildReport,
  createInitialState,
  replay,
  verifyEventStream,
} from '../src';
import { act, canonicalUntil, ctx, errorCodes, expectedConcentration } from './helpers';

const NumberExpectation = z.union([
  z.strictObject({ value: z.number(), tolerance: z.number().nonnegative() }),
  z.strictObject({ lessThan: z.number() }),
  z.strictObject({ greaterThan: z.number() }),
]);

const Expectation = z.strictObject({
  attempt: z.int().optional(),
  retries: z.int().optional(),
  submitted: z.boolean().optional(),
  errorCodes: z.array(ErrorCodeSchema).optional(),
  allAttemptErrorCodes: z.array(ErrorCodeSchema).optional(),
  resolvedCodes: z.array(ErrorCodeSchema).optional(),
  openErrors: z.array(ErrorCodeSchema).optional(),
  restartRequired: z.boolean().optional(),
  purityRisks: z.array(ErrorCodeSchema).optional(),
  homogeneity: z.string().optional(),
  volumeValidity: z.string().optional(),
  transferredMass: NumberExpectation.optional(),
  finalVolume: NumberExpectation.optional(),
  concentration: NumberExpectation.nullable().optional(),
});

const Step = z.union([
  z.strictObject({
    canonicalUntil: z.union([CanonicalStepIdSchema, z.literal('end')]),
    skip: z.array(CanonicalStepIdSchema).optional(),
  }),
  z.strictObject({ action: ActionSchema, acknowledgedSafetyWarning: z.boolean().optional() }),
  z.strictObject({ expect: Expectation }),
]);

const ScenarioSchema = z.strictObject({
  scenarioId: z.string(),
  description: z.string(),
  init: SessionInitSchema,
  steps: z.array(Step).min(1),
  expect: Expectation,
});

const dir = new URL('../../../content/experiments/exp04/scenarios/', import.meta.url);
const scenarios = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ScenarioSchema.parse(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))));

const checkNumber = (
  label: string,
  actual: number | null | undefined,
  e: z.infer<typeof NumberExpectation>,
) => {
  expect(actual, label).not.toBeNull();
  const v = actual ?? NaN;
  if ('value' in e)
    expect(Math.abs(v - e.value), `${label}: ${v}`).toBeLessThanOrEqual(e.tolerance);
  else if ('lessThan' in e) expect(v, label).toBeLessThan(e.lessThan);
  else expect(v, label).toBeGreaterThan(e.greaterThan);
};

const checkExpectation = (s: SimulationState, e: z.infer<typeof Expectation>) => {
  const { lab, meta } = s;
  const attemptEvents = s.events.filter((ev) => ev.attempt === meta.attempt);
  if (e.attempt !== undefined) expect(meta.attempt).toBe(e.attempt);
  if (e.retries !== undefined) expect(meta.retries).toBe(e.retries);
  if (e.submitted !== undefined) expect(lab.submitted).toBe(e.submitted);
  if (e.errorCodes) expect(errorCodes(s)).toEqual(e.errorCodes);
  if (e.allAttemptErrorCodes)
    expect(s.events.flatMap((ev) => ev.errors.map((x) => x.code))).toEqual(e.allAttemptErrorCodes);
  if (e.resolvedCodes)
    expect(attemptEvents.flatMap((ev) => ev.resolvedErrors.map((r) => r.code))).toEqual(
      e.resolvedCodes,
    );
  if (e.openErrors) expect(lab.openErrors.map((o) => o.code)).toEqual(e.openErrors);
  if (e.restartRequired !== undefined) expect(lab.restartRequired).toBe(e.restartRequired);
  if (e.purityRisks)
    expect([...new Set(lab.risks.purity.map((r) => r.code))]).toEqual(e.purityRisks);
  if (e.homogeneity) expect(lab.risks.homogeneity).toBe(e.homogeneity);
  if (e.volumeValidity) expect(lab.risks.volumeValidity).toBe(e.volumeValidity);
  const mass = lab.flask.soluteDissolved.value + lab.flask.soluteUndissolved.value;
  if (e.transferredMass) checkNumber('transferredMass', mass, e.transferredMass);
  if (e.finalVolume) checkNumber('finalVolume', lab.flask.finalVolume?.value, e.finalVolume);
  const c = achievedConcentration(lab, ctx.definition).value?.value;
  if (e.concentration === null) expect(c).toBeUndefined();
  else if (e.concentration) checkNumber('concentration', c, e.concentration);
  // The concentration always follows from the modelled mass and volume.
  if (c !== undefined && lab.flask.finalVolume)
    expect(c).toBeCloseTo(expectedConcentration(mass, lab.flask.finalVolume.value), 12);
};

describe.each(scenarios.map((s) => [s.scenarioId, s] as const))('scenario %s', (_id, scenario) => {
  const run = () => {
    let s = createInitialState(scenario.init, ctx);
    for (const step of scenario.steps) {
      if ('canonicalUntil' in step) s = canonicalUntil(s, step.canonicalUntil, step.skip ?? []);
      else if ('action' in step) {
        const r = act(s, step.action, { ack: step.acknowledgedSafetyWarning ?? false });
        expect(r.events[0]?.rejectionCode ?? null, JSON.stringify(step.action)).toBeNull();
        s = r.state;
      } else checkExpectation(s, step.expect);
    }
    return s;
  };
  const final = run();

  it('meets the scenario expectations', () => checkExpectation(final, scenario.expect));

  it('replays to an identical state and report', () => {
    const replayed = replay(
      scenario.init,
      final.events.map((e) => e.envelope),
      ctx,
    );
    expect(replayed).toEqual(final);
    expect(buildReport(replayed, ctx)).toEqual(buildReport(final, ctx));
    expect(verifyEventStream(scenario.init, final.events, ctx).ok).toBe(true);
  });

  it('backs every report deduction with events', () => {
    const seqs = new Set(final.events.map((e) => e.seq));
    for (const d of buildReport(final, ctx).categories.flatMap((c) => c.deductions)) {
      expect(d.eventSeqs.length).toBeGreaterThan(0);
      d.eventSeqs.forEach((q) => expect(seqs.has(q)).toBe(true));
    }
  });
});

it('ships the four required scenario fixtures', () => {
  expect(scenarios.map((s) => s.scenarioId).sort()).toEqual([
    'multi_error_manual',
    'perfect_run',
    'recoverable_error',
    'restart_required_error',
  ]);
});
