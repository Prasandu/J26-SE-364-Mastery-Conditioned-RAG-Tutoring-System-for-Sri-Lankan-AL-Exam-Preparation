import type {
  Disclosure,
  DomainEvent,
  Feedback,
  MeasurementId,
  ObservationId,
  PublicEvent,
  SessionView,
  SimulationState,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import { guidanceFor, visibleFeedback } from './guidance';
import { nextCanonicalStep } from './procedure';

/**
 * Public projection shared by the server verifier and the offline adapter.
 *
 * Manual mode uses `observable` disclosure for the whole live session: error codes, derived
 * measurements, validity risks, true volumes behind a judged make-up and RNG state are never
 * projected. They are revealed only in the completed report.
 */

/** Readings the learner sees directly on the apparatus. */
export const OBSERVABLE_MEASUREMENTS: readonly MeasurementId[] = [
  'watch_glass_mass',
  'balance_slider_setting',
  'weighed_solute_mass',
];

const LEVEL: Partial<Record<ObservationId, SessionView['bench']['liquid']>> = {
  liquid_below_mark: 'below_mark',
  meniscus_at_mark: 'at_mark',
  liquid_above_mark: 'above_mark',
};

export const disclosureOf = (state: SimulationState): Disclosure =>
  state.meta.mode === 'manual' ? 'observable' : 'full';

export const projectEvent = (e: DomainEvent, disclosure: Disclosure): PublicEvent => {
  const full = disclosure === 'full';
  return {
    seq: e.seq,
    attempt: e.attempt,
    actor: e.actor,
    actionType: e.envelope.action.type,
    action: e.envelope.action,
    accepted: e.accepted,
    rejectionCode: e.rejectionCode,
    elapsedMs: e.elapsedMs,
    hintUsed: e.hintUsed,
    observations: e.observations,
    measurements: full
      ? e.measurements
      : e.measurements.filter((m) => OBSERVABLE_MEASUREMENTS.includes(m.id)),
    errors: full ? e.errors : [],
    resolvedErrors: full ? e.resolvedErrors : [],
  };
};

export const projectFeedback = (
  feedback: Feedback[],
  state: SimulationState,
  ctx: SimulationContext,
): Feedback[] => visibleFeedback(feedback, state, ctx);

const perceivedLevel = (state: SimulationState): SessionView['bench']['liquid'] => {
  if (state.lab.flask.liquidVolume.value <= 0) return 'empty';
  const attempt = state.events.filter((e) => e.attempt === state.meta.attempt);
  for (let i = attempt.length - 1; i >= 0; i--) {
    const obs = attempt[i]?.observations ?? [];
    for (let j = obs.length - 1; j >= 0; j--) {
      const level = LEVEL[obs[j] as ObservationId];
      if (level) return level;
    }
  }
  return 'below_mark';
};

export const projectSession = (state: SimulationState, ctx: SimulationContext): SessionView => {
  const { lab, meta } = state;
  const disclosure = disclosureOf(state);
  const guidance = guidanceFor(state, ctx);
  const step = nextCanonicalStep(state, ctx);
  const liquid = perceivedLevel(state);
  const capacity = lab.flask.capacity?.value ?? 0;
  const trueFraction = capacity > 0 ? Math.min(1.1, lab.flask.liquidVolume.value / capacity) : 0;

  return {
    sessionId: meta.sessionId,
    experimentId: meta.experimentId,
    definitionVersion: meta.definitionVersion,
    assessmentVersion: meta.assessmentVersion,
    mode: meta.mode,
    guidanceLevel: meta.guidanceLevel,
    startedOn: meta.startedOn,
    attempt: meta.attempt,
    hints: meta.hints,
    retries: meta.retries,
    elapsedMs: meta.elapsedMs,
    nextSequence: meta.nextSeq,
    status: lab.submitted ? 'submitted' : 'active',
    disclosure,
    stage: lab.stage,
    bench: {
      safetyConfirmed: lab.safetyConfirmed,
      selectedApparatus: [...lab.selectedApparatus],
      cleanliness: { ...lab.cleanliness },
      workingFlaskId: lab.workingFlaskId,
      flaskCapacity: lab.flask.capacity,
      balance: { ...lab.balance },
      watchGlassHasSolid: lab.watchGlass.solid.value > 0,
      funnelOnFlask: lab.funnel.onFlask,
      stoppered: lab.flask.stoppered,
      madeUp: lab.flask.madeUp,
      liquid,
      // What the learner judged to be on the mark is drawn on the mark; the true volume stays hidden.
      liquidFraction: disclosure === 'observable' && liquid === 'at_mark' ? 1 : trueFraction,
      undissolvedVisible: lab.flask.soluteUndissolved.value > 0,
      label: lab.label,
    },
    validity:
      disclosure === 'full'
        ? {
            purityRisks: [...new Set(lab.risks.purity.map((r) => r.code))],
            homogeneity: lab.risks.homogeneity,
            volumeValidity: lab.risks.volumeValidity,
            restartRequired: lab.restartRequired,
          }
        : null,
    events: state.events.map((e) => projectEvent(e, disclosure)),
    guidance: {
      profile: guidance.profile,
      promptKey: guidance.promptKey,
      nextAction: guidance.nextAction,
      suggestedAction: guidance.profile === 'guided_beginner' ? (step?.action ?? null) : null,
      stepSourceRefs: guidance.profile === 'automatic' ? (step?.sourceRefs ?? []) : [],
      confirmPredictedErrors: guidance.confirmPredictedErrors,
      showProceduralFeedback: guidance.showProceduralFeedback,
      safetyPolicy: guidance.safetyPolicy,
    },
  };
};
