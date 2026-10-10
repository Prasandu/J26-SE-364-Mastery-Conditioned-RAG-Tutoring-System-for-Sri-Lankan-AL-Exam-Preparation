import type {
  ActionEnvelope,
  DomainEvent,
  ErrorCode,
  ErrorRule,
  Feedback,
  RejectionCode,
  SessionInit,
  SimulationState,
  SourceRef,
} from '@vlab/contracts';
import { applyAction, newAttemptLab } from './actions';
import type { SimulationContext } from './context';
import { safetyPolicy } from './context';
import { fingerprint } from './fingerprint';
import { computeStage } from './lab';
import { firstFailingPrecondition } from './preconditions';
import { seedToRngState } from './rng';

export interface TransitionResult {
  state: SimulationState;
  events: DomainEvent[];
  feedback: Feedback[];
}

const errorRule = (ctx: SimulationContext, code: ErrorCode): ErrorRule => {
  const rule = ctx.definition.errorRules.find((r) => r.code === code);
  if (!rule) throw new Error(`Experiment definition has no error rule for ${code}`);
  return rule;
};

const dedupeRefs = (refs: SourceRef[]): SourceRef[] => {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.sourceId}:${r.factId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const createInitialState = (init: SessionInit, ctx: SimulationContext): SimulationState => {
  const { lab, rngState } = newAttemptLab(seedToRngState(init.seed), ctx);
  return {
    lab,
    meta: {
      sessionId: init.sessionId,
      experimentId: ctx.definition.experimentId,
      definitionVersion: ctx.definition.definitionVersion,
      assessmentVersion: ctx.assessment.version,
      mode: init.mode,
      guidanceLevel: init.mode === 'guided' ? (init.guidanceLevel ?? 'beginner') : null,
      seed: init.seed,
      rngState,
      attempt: 1,
      startedOn: init.startedOn,
      hints: 0,
      retries: 0,
      elapsedMs: 0,
      nextSeq: 0,
    },
    events: [],
  };
};

/**
 * Deterministic, side-effect-free transition.
 *
 * - Physically impossible actions are rejected: lab state is untouched, a rejected event is logged.
 * - Physically possible but incorrect actions are accepted; the consequence and error are recorded.
 * - Unsafe actions record a safety violation; under a `confirm` policy they first need acknowledgement.
 */
export const transition = (
  state: SimulationState,
  envelope: ActionEnvelope,
  ctx: SimulationContext,
): TransitionResult => {
  const { meta } = state;
  const seq = meta.nextSeq;
  const fingerprintBefore = fingerprint(state);
  const action = envelope.action;
  const actionSpec = ctx.definition.availableActions.find((a) => a.type === action.type);

  let rejection: RejectionCode | null =
    envelope.elapsedMs < meta.elapsedMs ? 'invalid_envelope' : null;
  rejection ??= firstFailingPrecondition(state, action, ctx);

  let outcome = rejection ? null : applyAction(state, action, ctx);
  if (
    outcome &&
    !envelope.acknowledgedSafetyWarning &&
    safetyPolicy(ctx, meta) === 'confirm' &&
    outcome.raised.some((c) => errorRule(ctx, c).category === 'safety_violation')
  ) {
    rejection = 'safety_acknowledgement_required';
    outcome = null;
  }

  const baseEvent = {
    seq,
    sessionId: meta.sessionId,
    attempt: meta.attempt,
    actor: envelope.actor,
    envelope,
    mode: meta.mode,
    guidanceLevel: meta.guidanceLevel,
    fingerprintBefore,
    elapsedMs: envelope.elapsedMs,
  };

  if (!outcome) {
    const event: DomainEvent = {
      ...baseEvent,
      accepted: false,
      rejectionCode: rejection,
      fingerprintAfter: fingerprintBefore,
      errors: [],
      resolvedErrors: [],
      measurements: [],
      observations: [],
      parameterIdsUsed: [],
      hintUsed: false,
      sourceRefs: actionSpec?.sourceRefs ?? [],
    };
    const nextState: SimulationState = {
      lab: state.lab,
      meta: { ...meta, nextSeq: seq + 1, elapsedMs: Math.max(meta.elapsedMs, envelope.elapsedMs) },
      events: [...state.events, event],
    };
    return {
      state: nextState,
      events: [event],
      feedback: [
        {
          severity: rejection === 'safety_acknowledgement_required' ? 'safety' : 'error',
          messageKey: `engine.rejection.${rejection}`,
          errorCode: null,
          visibility: 'always',
        },
      ],
    };
  }

  // ---- accepted: record errors once per attempt (recoverable ones may re-open after correction)
  const lab = outcome.lab;
  const eventErrors: DomainEvent['errors'] = [];
  const feedback: Feedback[] = [];
  const params = new Set(outcome.params);
  for (const code of new Set(outcome.raised)) {
    const rule = errorRule(ctx, code);
    const isOpen = lab.openErrors.some((e) => e.code === code);
    if (lab.recordedErrors.includes(code) && (rule.recoverability !== 'recoverable' || isOpen))
      continue;
    if (!lab.recordedErrors.includes(code)) lab.recordedErrors.push(code);
    if (rule.recoverability === 'recoverable') lab.openErrors.push({ code, seq });
    if (rule.recoverability === 'restart_required') lab.restartRequired = true;
    rule.parameterIds.forEach((p) => params.add(p));
    eventErrors.push({
      code,
      category: rule.category,
      consequence: rule.consequence,
      recoverability: rule.recoverability,
      parameterIds: rule.parameterIds,
      sourceRefs: rule.sourceRefs,
    });
    feedback.push({
      severity: rule.category === 'safety_violation' ? 'safety' : 'warning',
      messageKey: rule.messageKey,
      errorCode: code,
      visibility: rule.category === 'safety_violation' ? 'always' : 'procedural',
    });
  }
  const resolvedErrors: DomainEvent['resolvedErrors'] = [];
  for (const code of new Set(outcome.resolved)) {
    const open = lab.openErrors.find((e) => e.code === code);
    if (!open || open.seq === seq) continue;
    lab.openErrors = lab.openErrors.filter((e) => e !== open);
    resolvedErrors.push(open);
    feedback.push({
      severity: 'info',
      messageKey: 'engine.feedback.error_resolved',
      errorCode: code,
      visibility: 'procedural',
    });
  }
  lab.openErrors = lab.openErrors.filter((e) => !outcome.windowClosed.includes(e.code));
  lab.stage = computeStage(lab);

  for (const id of outcome.observations) {
    const obs = ctx.definition.observations.find((o) => o.id === id);
    if (obs)
      feedback.push({
        severity: 'observation',
        messageKey: obs.textKey,
        errorCode: null,
        visibility: 'always',
      });
  }
  for (const key of outcome.infoKeys)
    feedback.push({ severity: 'info', messageKey: key, errorCode: null, visibility: 'always' });

  const nextMeta = {
    ...meta,
    ...outcome.metaPatch,
    rngState: outcome.rngState,
    nextSeq: seq + 1,
    elapsedMs: Math.max(meta.elapsedMs, envelope.elapsedMs),
  };
  const fingerprintAfter = fingerprint({ lab, meta: nextMeta });
  const event: DomainEvent = {
    ...baseEvent,
    accepted: true,
    rejectionCode: null,
    fingerprintAfter,
    errors: eventErrors,
    resolvedErrors,
    measurements: outcome.measurements,
    observations: outcome.observations,
    parameterIdsUsed: [...params].sort(),
    hintUsed: outcome.hintUsed,
    sourceRefs: dedupeRefs([
      ...(actionSpec?.sourceRefs ?? []),
      ...eventErrors.flatMap((e) => e.sourceRefs),
    ]),
  };
  return {
    state: { lab, meta: nextMeta, events: [...state.events, event] },
    events: [event],
    feedback,
  };
};
