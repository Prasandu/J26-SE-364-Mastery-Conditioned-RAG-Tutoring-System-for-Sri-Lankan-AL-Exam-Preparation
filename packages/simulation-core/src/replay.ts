import type { ActionEnvelope, DomainEvent, SessionInit, SimulationState } from '@vlab/contracts';
import type { SimulationContext } from './context';
import { createInitialState, transition } from './engine';
import { canonicalAction, nextCanonicalStep } from './procedure';

/** Rebuild state by re-running envelopes through the engine. */
export const replay = (
  init: SessionInit,
  envelopes: readonly ActionEnvelope[],
  ctx: SimulationContext,
): SimulationState =>
  envelopes.reduce((s, env) => transition(s, env, ctx).state, createInitialState(init, ctx));

export type VerificationResult =
  { ok: true; state: SimulationState } | { ok: false; divergedAtSeq: number; field: string };

/** Verify a client-supplied event stream by replaying it; any divergence is reported by sequence. */
export const verifyEventStream = (
  init: SessionInit,
  events: readonly DomainEvent[],
  ctx: SimulationContext,
): VerificationResult => {
  let state = createInitialState(init, ctx);
  for (const claimed of events) {
    const result = transition(state, claimed.envelope, ctx);
    const [actual] = result.events;
    if (!actual) return { ok: false, divergedAtSeq: claimed.seq, field: 'event' };
    for (const field of ['seq', 'accepted', 'fingerprintBefore', 'fingerprintAfter'] as const)
      if (actual[field] !== claimed[field]) return { ok: false, divergedAtSeq: claimed.seq, field };
    state = result.state;
  }
  return { ok: true, state };
};

/** Automatic demonstration: the system performs each canonical step through the same engine. */
export const runAutomatic = (
  state: SimulationState,
  ctx: SimulationContext,
  stepMs = 1000,
  maxSteps = 100,
): SimulationState => {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    const step = nextCanonicalStep(s, ctx);
    if (!step) return s;
    const result = transition(
      s,
      {
        action: canonicalAction(step, s, ctx),
        actor: 'system',
        elapsedMs: s.meta.elapsedMs + stepMs,
        acknowledgedSafetyWarning: false,
      },
      ctx,
    );
    s = result.state;
    if (!result.events[0]?.accepted) return s;
  }
  return s;
};
