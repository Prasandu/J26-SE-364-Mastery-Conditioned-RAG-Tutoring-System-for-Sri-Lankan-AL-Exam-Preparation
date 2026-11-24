import { z } from 'zod';
import { ActionSchema, ActorSchema } from './action';
import {
  ActionTypeSchema,
  ErrorCodeSchema,
  MeasurementIdSchema,
  ObservationIdSchema,
  RejectionCodeSchema,
  StageIdSchema,
} from './codes';
import {
  GuidanceLevelSchema,
  GuidanceProfileSchema,
  IdSchema,
  LocKeySchema,
  MassSchema,
  ModeSchema,
  QuantitySchema,
  VolumeSchema,
} from './common';
import { SourceRefSchema } from './source';
import { EventErrorSchema } from './state';

/**
 * Public session projection: what the learner may see now. Produced by simulation-core for both the
 * server and the offline adapter, so both apply the same disclosure rules.
 *
 * `disclosure: observable` (manual mode) omits engine-only information: error codes, derived
 * measurements, true volumes after a judged make-up, validity risks and RNG state. These appear
 * only in the completed report.
 */
export const DisclosureSchema = z.enum(['full', 'observable']);
export type Disclosure = z.infer<typeof DisclosureSchema>;

export const PublicEventSchema = z.strictObject({
  seq: z.int().nonnegative(),
  attempt: z.int().positive(),
  actor: ActorSchema,
  actionType: ActionTypeSchema,
  /** The learner's own submitted action. */
  action: ActionSchema,
  accepted: z.boolean(),
  rejectionCode: RejectionCodeSchema.nullable(),
  elapsedMs: z.int().nonnegative(),
  hintUsed: z.boolean(),
  observations: z.array(ObservationIdSchema),
  measurements: z.array(z.strictObject({ id: MeasurementIdSchema, quantity: QuantitySchema })),
  /** Empty under `observable` disclosure. */
  errors: z.array(EventErrorSchema),
  resolvedErrors: z.array(z.strictObject({ code: ErrorCodeSchema, seq: z.int().nonnegative() })),
});
export type PublicEvent = z.infer<typeof PublicEventSchema>;

export const LiquidLevelSchema = z.enum(['empty', 'below_mark', 'at_mark', 'above_mark']);

export const BenchViewSchema = z.strictObject({
  safetyConfirmed: z.boolean(),
  selectedApparatus: z.array(IdSchema),
  cleanliness: z.record(IdSchema, z.enum(['dirty', 'clean'])),
  workingFlaskId: IdSchema.nullable(),
  flaskCapacity: VolumeSchema.nullable(),
  balance: z.strictObject({
    pan: z.enum(['empty', 'watch_glass']),
    sliderSetting: MassSchema.nullable(),
    watchGlassReading: MassSchema.nullable(),
  }),
  watchGlassHasSolid: z.boolean(),
  funnelOnFlask: z.boolean(),
  stoppered: z.boolean(),
  madeUp: z.boolean(),
  /** As perceived: follows the engine's latest level observation. */
  liquid: LiquidLevelSchema,
  /** Display scale relative to the mark; under `observable` a judged-at-mark level is drawn at 1. */
  liquidFraction: z.number().min(0).max(1.1),
  undissolvedVisible: z.boolean(),
  label: z
    .strictObject({
      solutionName: z.string(),
      concentration: QuantitySchema.nullable(),
      preparationDate: z.string().nullable(),
    })
    .nullable(),
});

export const GuidanceViewSchema = z.strictObject({
  profile: GuidanceProfileSchema,
  promptKey: LocKeySchema.nullable(),
  /** Automatic demonstration only. */
  nextAction: ActionSchema.nullable(),
  /** Guided beginner only. */
  suggestedAction: ActionTypeSchema.nullable(),
  /** Automatic demonstration only: sources for the step being narrated. */
  stepSourceRefs: z.array(SourceRefSchema),
  confirmPredictedErrors: z.boolean(),
  showProceduralFeedback: z.boolean(),
  safetyPolicy: z.enum(['confirm', 'warn']),
});

export const SessionViewSchema = z.strictObject({
  sessionId: z.string().min(1).max(64),
  experimentId: IdSchema,
  definitionVersion: z.string(),
  assessmentVersion: z.string(),
  mode: ModeSchema,
  guidanceLevel: GuidanceLevelSchema.nullable(),
  startedOn: z.iso.date(),
  attempt: z.int().positive(),
  hints: z.int().nonnegative(),
  retries: z.int().nonnegative(),
  elapsedMs: z.int().nonnegative(),
  nextSequence: z.int().nonnegative(),
  status: z.enum(['active', 'submitted']),
  disclosure: DisclosureSchema,
  stage: StageIdSchema,
  bench: BenchViewSchema,
  /** null under `observable` disclosure. */
  validity: z
    .strictObject({
      purityRisks: z.array(ErrorCodeSchema),
      homogeneity: z.enum(['not_applicable', 'not_mixed', 'partially_mixed', 'homogeneous']),
      volumeValidity: z.enum(['not_made_up', 'valid', 'invalid']),
      restartRequired: z.boolean(),
    })
    .nullable(),
  events: z.array(PublicEventSchema),
  guidance: GuidanceViewSchema,
});
export type SessionView = z.infer<typeof SessionViewSchema>;
