import {
  ActionResultSchema,
  ActionSubmissionSchema,
  ApiErrorSchema,
  CreateSessionRequestSchema,
  emptyNotebook,
  NotebookSaveRequestSchema,
  ReportSchema,
  SessionResourceSchema,
  type Action,
  type SessionInit,
  type SimulationState,
} from '@vlab/contracts';
import {
  buildReport,
  createInitialState,
  disclosureOf,
  projectEvent,
  projectFeedback,
  projectSession,
  transition,
} from '../src';
import { canonicalAction, nextCanonicalStep } from '../src';
import { ctx } from './helpers';

/**
 * Cross-implementation fixtures written to packages/contracts/fixtures/. The Python API replays the
 * `parity/*` action sequences over HTTP and must produce the same public views, feedback and report
 * (ignoring server-assigned session IDs and elapsed times).
 */
export const STARTED_ON = '2026-10-10';

interface Step {
  envelope: { action: Action; actor: 'student' | 'system'; acknowledgedSafetyWarning: boolean };
  expected: unknown;
}

const run = (init: SessionInit, plan: (s: SimulationState) => Action | null) => {
  let state = createInitialState(init, ctx);
  const steps: Step[] = [];
  for (let i = 0; i < 80; i++) {
    const action = plan(state);
    if (!action) break;
    const envelope = { action, actor: 'student' as const, acknowledgedSafetyWarning: false };
    const result = transition(state, { ...envelope, elapsedMs: (i + 1) * 1000 }, ctx);
    state = result.state;
    const [event] = result.events;
    if (!event) throw new Error('no event');
    steps.push({
      envelope,
      expected: ActionResultSchema.parse({
        event: projectEvent(event, disclosureOf(state)),
        feedback: projectFeedback(result.feedback, state, ctx),
        session: projectSession(state, ctx),
      }),
    });
  }
  return {
    init,
    steps,
    finalReport: state.lab.submitted ? ReportSchema.parse(buildReport(state, ctx)) : null,
  };
};

const canonical = (s: SimulationState) => {
  const step = nextCanonicalStep(s, ctx);
  return step ? canonicalAction(step, s, ctx) : null;
};

const checklist = ctx.definition.safetyRules.filter((r) => r.kind === 'checklist').map((r) => r.id);

/** Manual run with hidden mistakes: tap water, an unrinsed funnel and an eye-level error. */
const manualPlan = () => {
  const overrides = new Map<string, Action>([
    ['rinse_funnel', { type: 'remove_funnel' }],
    [
      'add_dissolution_water',
      { type: 'add_water', volume: { value: 80, unit: 'cm3' }, source: 'tap' },
    ],
    ['adjust_to_mark', { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'above' }],
  ]);
  const used = new Set<string>();
  return (s: SimulationState): Action | null => {
    const step = nextCanonicalStep(s, ctx);
    if (!step) return null;
    if (overrides.has(step.stepId) && !used.has(step.stepId)) {
      used.add(step.stepId);
      return overrides.get(step.stepId) ?? null;
    }
    return canonicalAction(step, s, ctx);
  };
};

/** Manual run that makes the flask up with water only and submits (zero transferred solute). */
const zeroSolutePlan = () => {
  const plan: Action[] = [
    { type: 'confirm_safety', checklistItemIds: checklist },
    { type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] },
    { type: 'clean_glassware', apparatusIds: ['volumetric_flask_250'] },
    { type: 'add_water', volume: { value: 250, unit: 'cm3' }, source: 'distilled' },
    { type: 'submit_experiment' },
  ];
  let i = 0;
  return () => plan[i++] ?? null;
};

export const buildSharedFixtures = (): Record<string, unknown> => {
  const perfect = run(
    {
      sessionId: 'fixture',
      mode: 'guided',
      guidanceLevel: 'beginner',
      seed: 42,
      startedOn: STARTED_ON,
    },
    canonical,
  );
  const manual = run(
    { sessionId: 'fixture', mode: 'manual', guidanceLevel: null, seed: 42, startedOn: STARTED_ON },
    manualPlan(),
  );
  const zeroSolute = run(
    { sessionId: 'fixture', mode: 'manual', guidanceLevel: null, seed: 42, startedOn: STARTED_ON },
    zeroSolutePlan(),
  );
  const firstView = (perfect.steps[0]?.expected as { session: unknown }).session;

  return {
    'parity/perfect-guided-beginner.json': perfect,
    'parity/manual-hidden-errors.json': manual,
    'parity/manual-zero-solute.json': zeroSolute,
    'api/create-session-request.json': CreateSessionRequestSchema.parse({
      experimentId: ctx.definition.experimentId,
      experimentVersion: ctx.definition.definitionVersion,
      assessmentVersion: ctx.assessment.version,
      mode: 'guided',
      guidanceLevel: 'beginner',
      locale: 'si',
      preLab: {
        answers: { q2: 'සාන්ද්‍රණය = ප්‍රමාණය ÷ පරිමාව' },
        prediction: 'clear solution',
        acknowledgedSafety: checklist,
      },
    }),
    'api/session-resource.json': SessionResourceSchema.parse({
      session: firstView,
      locale: 'en',
      createdAt: '2026-10-10T03:00:00.000Z',
      notebook: { version: 0, document: null, updatedAt: null },
    }),
    'api/action-submission.json': ActionSubmissionSchema.parse({
      clientActionId: '7b0f2c1e-8d4a-4f6e-9a3b-2c5d6e7f8a9b',
      expectedSequence: 0,
      envelope: {
        action: { type: 'confirm_safety', checklistItemIds: checklist },
        actor: 'student',
        acknowledgedSafetyWarning: false,
      },
      preview: false,
    }),
    'api/notebook-save-request.json': NotebookSaveRequestSchema.parse({
      expectedVersion: 0,
      document: {
        ...emptyNotebook(STARTED_ON),
        aim: 'To prepare 250 cm³ of 1 mol dm⁻³ Na₂CO₃ solution.',
        measurements: [
          { label: 'Mass of watch glass', trial: 1, value: 31.42, unit: 'g', note: '' },
        ],
      },
    }),
    'api/error.json': ApiErrorSchema.parse({
      error: {
        code: 'stale_sequence',
        message: 'The session has moved on; reload before acting',
        correlationId: 'c0ffee00-0000-4000-8000-000000000001',
        retryable: false,
        details: { currentSequence: 3 },
      },
    }),
  };
};
