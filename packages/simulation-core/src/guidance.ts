import type {
  Action,
  ActionEnvelope,
  ErrorCode,
  Feedback,
  GuidanceLevel,
  GuidanceProfile,
  LocKey,
  SimulationState,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import { paramNumber, profileOf, safetyPolicy } from './context';
import { transition } from './engine';
import { canonicalAction, nextCanonicalStep } from './procedure';

/**
 * Rule-based guidance. It changes prompts, hints and confirmations only; every mode uses the same
 * transition engine, so guidance can never turn an incorrect action into a correct one.
 */
export interface Guidance {
  profile: GuidanceProfile;
  /** Prompt shown without the student asking (null in manual mode). */
  promptKey: LocKey | null;
  /** Action the system performs next (automatic mode only). */
  nextAction: Action | null;
  /** Ask the student to confirm before performing an action predicted to cause an error. */
  confirmPredictedErrors: boolean;
  /** Whether procedural-error feedback is shown immediately (manual: only in the report). */
  showProceduralFeedback: boolean;
  safetyPolicy: 'confirm' | 'warn';
}

export const guidanceFor = (state: SimulationState, ctx: SimulationContext): Guidance => {
  const profile = profileOf(state.meta);
  const step = nextCanonicalStep(state, ctx);
  const stage = ctx.definition.stages.find((s) => s.id === state.lab.stage);
  const base = { profile, safetyPolicy: safetyPolicy(ctx, state.meta) };
  switch (profile) {
    case 'automatic':
      return {
        ...base,
        promptKey: step?.instructionKey ?? null,
        nextAction: step ? canonicalAction(step, state, ctx) : null,
        confirmPredictedErrors: false,
        showProceduralFeedback: true,
      };
    case 'guided_beginner':
      return {
        ...base,
        promptKey: step?.instructionKey ?? null,
        nextAction: null,
        confirmPredictedErrors: true,
        showProceduralFeedback: true,
      };
    case 'guided_intermediate':
      return {
        ...base,
        promptKey: step?.hintKey ?? null,
        nextAction: null,
        confirmPredictedErrors: false,
        showProceduralFeedback: true,
      };
    case 'guided_advanced':
      return {
        ...base,
        promptKey: stage?.goalKey ?? null,
        nextAction: null,
        confirmPredictedErrors: false,
        showProceduralFeedback: true,
      };
    case 'manual':
      return {
        ...base,
        promptKey: null,
        nextAction: null,
        confirmPredictedErrors: false,
        showProceduralFeedback: false,
      };
  }
};

/** Filters engine feedback for display. Manual mode still shows physical rejections and safety. */
export const visibleFeedback = (
  feedback: Feedback[],
  state: SimulationState,
  ctx: SimulationContext,
): Feedback[] =>
  guidanceFor(state, ctx).showProceduralFeedback
    ? feedback
    : feedback.filter((f) => f.visibility === 'always');

/** Errors an action would cause, without committing it (pure dry run of the same engine). */
export const predictErrors = (
  state: SimulationState,
  envelope: ActionEnvelope,
  ctx: SimulationContext,
): ErrorCode[] =>
  transition(state, envelope, ctx).events.flatMap((e) => e.errors.map((x) => x.code));

export interface GuidanceRecommendation {
  recommended: GuidanceLevel | null;
  reason: 'more_support' | 'less_support' | 'keep' | 'not_guided';
  evidenceSeqs: number[];
}

const LEVELS: GuidanceLevel[] = ['beginner', 'intermediate', 'advanced'];

/** Rule-based adaptive scaffolding recommendation (not an ML mastery model). */
export const recommendGuidanceLevel = (
  state: SimulationState,
  ctx: SimulationContext,
): GuidanceRecommendation => {
  const { meta } = state;
  if (meta.mode !== 'guided' || !meta.guidanceLevel)
    return { recommended: null, reason: 'not_guided', evidenceSeqs: [] };
  const { adaptation } = ctx.assessment;
  const level = LEVELS.indexOf(meta.guidanceLevel);
  const student = state.events.filter((e) => e.actor === 'student' && e.attempt === meta.attempt);
  const window = student.slice(-paramNumber(ctx, adaptation.windowActions));
  const erroneous = window.filter((e) => e.errors.length > 0 || !e.accepted);
  if (erroneous.length >= paramNumber(ctx, adaptation.errorsToStepDown) && level > 0)
    return {
      recommended: LEVELS[level - 1] ?? null,
      reason: 'more_support',
      evidenceSeqs: erroneous.map((e) => e.seq),
    };
  const cleanRun = student.slice(-paramNumber(ctx, adaptation.cleanActionsToStepUp));
  if (
    cleanRun.length === paramNumber(ctx, adaptation.cleanActionsToStepUp) &&
    cleanRun.every((e) => e.accepted && e.errors.length === 0 && !e.hintUsed) &&
    level < LEVELS.length - 1
  )
    return {
      recommended: LEVELS[level + 1] ?? null,
      reason: 'less_support',
      evidenceSeqs: cleanRun.map((e) => e.seq),
    };
  return { recommended: meta.guidanceLevel, reason: 'keep', evidenceSeqs: [] };
};
