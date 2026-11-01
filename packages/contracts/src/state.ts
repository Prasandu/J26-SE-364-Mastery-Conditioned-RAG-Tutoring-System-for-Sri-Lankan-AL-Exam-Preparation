import { z } from 'zod';
import { ActionEnvelopeSchema, ActorSchema } from './action';
import {
  ConsequenceSchema,
  ErrorCategorySchema,
  ErrorCodeSchema,
  MeasurementIdSchema,
  ObservationIdSchema,
  RecoverabilitySchema,
  RejectionCodeSchema,
  StageIdSchema,
} from './codes';
import {
  GuidanceLevelSchema,
  IdSchema,
  MassSchema,
  ModeSchema,
  QuantitySchema,
  VolumeSchema,
} from './common';
import { SourceRefSchema } from './source';

const ErrorRefSchema = z.strictObject({ code: ErrorCodeSchema, seq: z.int().nonnegative() });

export const LabStateSchema = z.strictObject({
  stage: StageIdSchema,
  safetyConfirmed: z.boolean(),
  selectedApparatus: z.array(IdSchema),
  cleanliness: z.record(IdSchema, z.enum(['dirty', 'clean'])),
  workingFlaskId: IdSchema.nullable(),
  balance: z.strictObject({
    pan: z.enum(['empty', 'watch_glass']),
    sliderSetting: MassSchema.nullable(),
    watchGlassReading: MassSchema.nullable(),
  }),
  watchGlass: z.strictObject({
    tareMass: MassSchema,
    solid: MassSchema,
    residue: MassSchema,
  }),
  funnel: z.strictObject({ onFlask: z.boolean(), residue: MassSchema }),
  transfer: z.strictObject({
    started: z.boolean(),
    closed: z.boolean(),
    weighedMass: MassSchema.nullable(),
    spilled: MassSchema,
    lostResidue: MassSchema,
    watchGlassRinsed: z.boolean(),
    funnelRinsed: z.boolean(),
  }),
  flask: z.strictObject({
    capacity: VolumeSchema.nullable(),
    soluteDissolved: MassSchema,
    soluteUndissolved: MassSchema,
    liquidVolume: VolumeSchema,
    stoppered: z.boolean(),
    madeUp: z.boolean(),
    finalVolume: VolumeSchema.nullable(),
    inversions: z.int().nonnegative(),
  }),
  label: z
    .strictObject({
      solutionName: z.string(),
      concentration: QuantitySchema.nullable(),
      preparationDate: z.string().nullable(),
    })
    .nullable(),
  risks: z.strictObject({
    purity: z.array(z.strictObject({ code: ErrorCodeSchema, apparatusId: IdSchema.nullable() })),
    homogeneity: z.enum(['not_applicable', 'not_mixed', 'partially_mixed', 'homogeneous']),
    volumeValidity: z.enum(['not_made_up', 'valid', 'invalid']),
  }),
  restartRequired: z.boolean(),
  /** Codes already recorded this attempt (each code is recorded once unless re-opened after correction). */
  recordedErrors: z.array(ErrorCodeSchema),
  /** Recoverable errors that have not yet been corrected. */
  openErrors: z.array(ErrorRefSchema),
  submitted: z.boolean(),
});
export type LabState = z.infer<typeof LabStateSchema>;

export const SessionMetaSchema = z.strictObject({
  sessionId: z.string().min(1).max(64),
  experimentId: IdSchema,
  definitionVersion: z.string(),
  assessmentVersion: z.string(),
  mode: ModeSchema,
  guidanceLevel: GuidanceLevelSchema.nullable(),
  seed: z.int().nonnegative(),
  rngState: z.int().nonnegative(),
  attempt: z.int().positive(),
  startedOn: z.iso.date(),
  hints: z.int().nonnegative(),
  retries: z.int().nonnegative(),
  elapsedMs: z.int().nonnegative(),
  nextSeq: z.int().nonnegative(),
});
export type SessionMeta = z.infer<typeof SessionMetaSchema>;

export const EventErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  category: ErrorCategorySchema,
  consequence: ConsequenceSchema,
  recoverability: RecoverabilitySchema,
  parameterIds: z.array(z.string()),
  sourceRefs: z.array(SourceRefSchema),
});

export const DomainEventSchema = z.strictObject({
  seq: z.int().nonnegative(),
  sessionId: z.string(),
  attempt: z.int().positive(),
  actor: ActorSchema,
  envelope: ActionEnvelopeSchema,
  accepted: z.boolean(),
  rejectionCode: RejectionCodeSchema.nullable(),
  mode: ModeSchema,
  guidanceLevel: GuidanceLevelSchema.nullable(),
  fingerprintBefore: z.string(),
  fingerprintAfter: z.string(),
  errors: z.array(EventErrorSchema),
  resolvedErrors: z.array(ErrorRefSchema),
  measurements: z.array(z.strictObject({ id: MeasurementIdSchema, quantity: QuantitySchema })),
  observations: z.array(ObservationIdSchema),
  parameterIdsUsed: z.array(z.string()),
  hintUsed: z.boolean(),
  elapsedMs: z.int().nonnegative(),
  sourceRefs: z.array(SourceRefSchema),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const SimulationStateSchema = z.strictObject({
  lab: LabStateSchema,
  meta: SessionMetaSchema,
  events: z.array(DomainEventSchema),
});
export type SimulationState = z.infer<typeof SimulationStateSchema>;

export const FeedbackSchema = z.strictObject({
  severity: z.enum(['info', 'observation', 'warning', 'error', 'safety']),
  messageKey: z.string(),
  errorCode: ErrorCodeSchema.nullable(),
  /** `always`: physical rejections, safety, observations. `procedural`: hidden in manual mode until the report. */
  visibility: z.enum(['always', 'procedural']),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const SessionInitSchema = z.strictObject({
  sessionId: z.string().min(1).max(64),
  mode: ModeSchema,
  guidanceLevel: GuidanceLevelSchema.nullable(),
  seed: z.int().nonnegative().max(0xffffffff),
  startedOn: z.iso.date(),
});
export type SessionInit = z.infer<typeof SessionInitSchema>;
