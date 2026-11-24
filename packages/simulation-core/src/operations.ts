import type {
  ActionEnvelope,
  DomainEvent,
  ErrorCode,
  Feedback,
  Report,
  SessionView,
  SimulationState,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import { transition } from './engine';
import { canonicalJson } from './fingerprint';
import { guidanceFor, predictErrors } from './guidance';
import { projectFeedback, projectSession } from './projection';
import { buildReport } from './scoring';

/**
 * Session operations shared by the server verifier CLI and the offline adapter, so both enforce
 * identical rules for system actions, previews and report availability.
 */
export type OperationError =
  'system_action_not_permitted' | 'preview_not_available' | 'not_submitted';
export type OperationResult<T> = ({ ok: true } & T) | { ok: false; code: OperationError };

export const applyEnvelope = (
  state: SimulationState,
  envelope: ActionEnvelope,
  ctx: SimulationContext,
): OperationResult<{
  state: SimulationState;
  event: DomainEvent;
  feedback: Feedback[];
  view: SessionView;
}> => {
  if (envelope.actor === 'system') {
    const expected = guidanceFor(state, ctx).nextAction;
    if (
      state.meta.mode !== 'automatic' ||
      !expected ||
      canonicalJson(expected) !== canonicalJson(envelope.action)
    )
      return { ok: false, code: 'system_action_not_permitted' };
  }
  const result = transition(state, envelope, ctx);
  const [event] = result.events;
  if (!event) throw new Error('Transition produced no event');
  return {
    ok: true,
    state: result.state,
    event,
    feedback: projectFeedback(result.feedback, result.state, ctx),
    view: projectSession(result.state, ctx),
  };
};

/** Guided beginner sees every predicted error; a `confirm` safety policy sees safety errors only. */
export const previewEnvelope = (
  state: SimulationState,
  envelope: ActionEnvelope,
  ctx: SimulationContext,
): OperationResult<{ predictedErrors: ErrorCode[] }> => {
  const guidance = guidanceFor(state, ctx);
  if (!guidance.confirmPredictedErrors && guidance.safetyPolicy !== 'confirm')
    return { ok: false, code: 'preview_not_available' };
  const predicted = predictErrors(state, { ...envelope, acknowledgedSafetyWarning: true }, ctx);
  const isSafety = (code: ErrorCode) =>
    ctx.definition.errorRules.find((r) => r.code === code)?.category === 'safety_violation';
  return {
    ok: true,
    predictedErrors: guidance.confirmPredictedErrors ? predicted : predicted.filter(isSafety),
  };
};

export const reportFor = (
  state: SimulationState,
  ctx: SimulationContext,
): OperationResult<{ report: Report }> =>
  state.lab.submitted
    ? { ok: true, report: buildReport(state, ctx) }
    : { ok: false, code: 'not_submitted' };
