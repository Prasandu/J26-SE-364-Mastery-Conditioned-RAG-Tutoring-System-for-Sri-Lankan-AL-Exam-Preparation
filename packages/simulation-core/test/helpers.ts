import {
  type Action,
  AssessmentDefinitionSchema,
  type CanonicalStepId,
  type ErrorCode,
  ExperimentDefinitionSchema,
  type SessionInit,
  type SimulationState,
} from '@vlab/contracts';
import { expect } from 'vitest';
import assessmentJson from '../../../content/experiments/exp04/assessment.v1.json';
import definitionJson from '../../../content/experiments/exp04/definition.v1.json';
import {
  canonicalAction,
  createInitialState,
  invariantViolations,
  isStepDone,
  nextCanonicalStep,
  type SimulationContext,
  transition,
  type TransitionResult,
} from '../src';

export const ctx: SimulationContext = {
  definition: ExperimentDefinitionSchema.parse(definitionJson),
  assessment: AssessmentDefinitionSchema.parse(assessmentJson),
};

export const STARTED_ON = '2026-10-10';

export const start = (over: Partial<SessionInit> = {}): SimulationState =>
  createInitialState(
    {
      sessionId: 'test-session',
      mode: 'manual',
      guidanceLevel: null,
      seed: 42,
      startedOn: STARTED_ON,
      ...over,
    },
    ctx,
  );

export const act = (
  state: SimulationState,
  action: Action,
  opts: { ack?: boolean; actor?: 'student' | 'system' } = {},
): TransitionResult => {
  const result = transition(
    state,
    {
      action,
      actor: opts.actor ?? 'student',
      elapsedMs: state.meta.elapsedMs + 1000,
      acknowledgedSafetyWarning: opts.ack ?? false,
    },
    ctx,
  );
  expect(invariantViolations(result.state.lab)).toEqual([]);
  return result;
};

/** Apply an action and return the next state. */
export const go = (
  state: SimulationState,
  action: Action,
  opts?: { ack?: boolean },
): SimulationState => act(state, action, opts).state;

export const accepted = (r: TransitionResult) => r.events[0]?.accepted === true;

const nextStep = (state: SimulationState, skip: readonly CanonicalStepId[]) =>
  skip.length === 0
    ? nextCanonicalStep(state, ctx)
    : (ctx.definition.procedure.find(
        (p) => !skip.includes(p.stepId) && !isStepDone(p, state.lab, ctx),
      ) ?? null);

/** Perform the canonical action for a specific step (asserting it is accepted). */
export const doStep = (state: SimulationState, stepId: CanonicalStepId): SimulationState => {
  const step = ctx.definition.procedure.find((p) => p.stepId === stepId);
  if (!step) throw new Error(`unknown step ${stepId}`);
  const r = act(state, canonicalAction(step, state, ctx));
  expect(r.events[0]?.rejectionCode ?? null, stepId).toBeNull();
  return r.state;
};

/** Perform the next canonical step; asserts it is `expected` when given. */
export const canonicalStep = (
  state: SimulationState,
  expected?: CanonicalStepId,
): SimulationState => {
  const step = nextCanonicalStep(state, ctx);
  if (!step) throw new Error('procedure already complete');
  if (expected) expect(step.stepId).toBe(expected);
  return doStep(state, step.stepId);
};

/**
 * Run canonical steps until the next step is `stop` (exclusive), or to the end when `stop` is 'end'.
 * Steps listed in `skip` are never performed (the student omits them).
 */
export const canonicalUntil = (
  state: SimulationState,
  stop: CanonicalStepId | 'end',
  skip: readonly CanonicalStepId[] = [],
): SimulationState => {
  let s = state;
  for (let i = 0; i < 60; i++) {
    const step = nextStep(s, skip);
    if (!step) {
      if (stop === 'end') return s;
      throw new Error(`procedure completed before reaching ${stop}`);
    }
    if (step.stepId === stop) return s;
    s = doStep(s, step.stepId);
  }
  throw new Error('canonicalUntil did not converge');
};

/** Error codes recorded in the current attempt, in order. */
export const errorCodes = (state: SimulationState): ErrorCode[] =>
  state.events
    .filter((e) => e.attempt === state.meta.attempt)
    .flatMap((e) => e.errors.map((x) => x.code));

export const g = (value: number) => ({ value, unit: 'g' as const });
export const cm3 = (value: number) => ({ value, unit: 'cm3' as const });

/** Concentration recomputed independently from the reported mass and volume. */
export const expectedConcentration = (massG: number, volumeCm3: number) =>
  massG / 106 / (volumeCm3 / 1000);
