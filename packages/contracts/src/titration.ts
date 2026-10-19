import { z } from 'zod';
import { IdSchema, ModeSchema, QuantitySchema, VolumeSchema } from './common';
import { SourceIdSchema } from './source';

const CandidateSourceRefSchema = z.strictObject({
  sourceId: SourceIdSchema,
  pdfPage: z.int().positive(),
  printedPage: z.int().positive().nullable(),
  factId: z
    .string()
    .regex(/^[A-Z]\d+$/)
    .nullable(),
  provenance: z.enum(['direct', 'derived', 'review_pending']),
});
export const TitrationSourceRefsSchema = z.array(CandidateSourceRefSchema).min(1);
export type TitrationSourceRef = z.infer<typeof CandidateSourceRefSchema>;

const ReviewStatusSchema = z.enum(['source_stated', 'teacher_review_pending']);
export const TitrationReviewStatusSchema = ReviewStatusSchema;
export type TitrationReviewStatus = z.infer<typeof ReviewStatusSchema>;

const ReviewedQuantitySchema = z.strictObject({
  quantity: QuantitySchema,
  sourceRefs: TitrationSourceRefsSchema,
  reviewStatus: ReviewStatusSchema,
});
export type ReviewedTitrationQuantity = z.infer<typeof ReviewedQuantitySchema>;

const PositiveCapacitySchema = z
  .strictObject({
    value: z.number().finite().positive().max(1000),
    unit: z.literal('cm3'),
  })
  .describe('Candidate apparatus capacity; bounds are data validation, not chemistry rules.');

const ApparatusCapabilitySchema = z.enum([
  'select',
  'clean',
  'fill',
  'transfer',
  'dispense',
  'read',
  'record',
  'observe',
]);
export type TitrationApparatusCapability = z.infer<typeof ApparatusCapabilitySchema>;

export const TitrationApparatusSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['volumetric_flask', 'pipette', 'burette', 'titration_flask', 'weighing_dish']),
  role: z.enum(['required', 'optional']),
  capacity: PositiveCapacitySchema.nullable(),
  capabilities: z.array(ApparatusCapabilitySchema).min(1),
  sourceRefs: TitrationSourceRefsSchema,
  reviewStatus: ReviewStatusSchema,
});
export type TitrationApparatus = z.infer<typeof TitrationApparatusSchema>;

export const TitrationReagentSchema = z.strictObject({
  id: IdSchema,
  formula: z.string().min(1),
  physicalState: z.enum(['solid', 'liquid']),
  role: z.enum(['analyte', 'titrant', 'indicator', 'solvent']),
  concentration: ReviewedQuantitySchema.nullable(),
  sourceRefs: TitrationSourceRefsSchema,
  reviewStatus: ReviewStatusSchema,
});
export type TitrationReagent = z.infer<typeof TitrationReagentSchema>;

const TitrationIndicatorSchema = z.enum(['phenolphthalein', 'methyl_orange']);
export type TitrationIndicator = z.infer<typeof TitrationIndicatorSchema>;

export const TitrationObservationSchema = z.enum([
  'dissolution',
  'air_bubble',
  'phenolphthalein_pink_to_colourless',
  'methyl_orange_orange_to_red',
]);
export type TitrationObservation = z.infer<typeof TitrationObservationSchema>;

export const TitrationCapabilitySchema = z.enum([
  'pipette_volume_recording',
  'burette_reading',
  'titrant_delivery',
  'indicator_addition',
  'endpoint_observation',
  'trial_measurement',
  'repeated_trials',
]);
export type TitrationCapability = z.infer<typeof TitrationCapabilitySchema>;

export const BuretteReadingSchema = z.strictObject({
  value: z.number().finite().nonnegative().max(100),
  unit: z.literal('cm3'),
});
export type BuretteReading = z.infer<typeof BuretteReadingSchema>;

export const PipetteVolumeRecordSchema = z.strictObject({
  apparatusId: IdSchema,
  volume: VolumeSchema,
  recordedAtTrial: z.int().positive().nullable(),
  sourceRefs: TitrationSourceRefsSchema,
});
export type PipetteVolumeRecord = z.infer<typeof PipetteVolumeRecordSchema>;

export const TitrantDeliveryRecordSchema = z.strictObject({
  apparatusId: IdSchema,
  initialReading: BuretteReadingSchema,
  finalReading: BuretteReadingSchema,
  sourceRefs: TitrationSourceRefsSchema,
});
export type TitrantDeliveryRecord = z.infer<typeof TitrantDeliveryRecordSchema>;

export const IndicatorAdditionSchema = z.strictObject({
  indicator: TitrationIndicatorSchema,
  drops: z.int().positive().max(100).nullable(),
  sourceRefs: TitrationSourceRefsSchema,
});
export type IndicatorAddition = z.infer<typeof IndicatorAdditionSchema>;

export const EndpointRecordSchema = z.strictObject({
  endpoint: z.enum(['first', 'second']),
  indicator: TitrationIndicatorSchema,
  observation: TitrationObservationSchema,
  buretteInitialReading: BuretteReadingSchema,
  buretteReading: BuretteReadingSchema,
  delivered: VolumeSchema,
  sourceRefs: TitrationSourceRefsSchema,
});
export type EndpointRecord = z.infer<typeof EndpointRecordSchema>;

export const TitrationTrialSchema = z
  .strictObject({
    trialNumber: z.int().positive(),
    aliquot: PipetteVolumeRecordSchema,
    firstEndpoint: EndpointRecordSchema,
    secondEndpoint: EndpointRecordSchema,
    sourceRefs: TitrationSourceRefsSchema,
  })
  .superRefine((trial, ctx) => {
    if (trial.firstEndpoint.endpoint !== 'first')
      ctx.addIssue({
        code: 'custom',
        path: ['firstEndpoint', 'endpoint'],
        message: 'first endpoint required',
      });
    if (trial.secondEndpoint.endpoint !== 'second')
      ctx.addIssue({
        code: 'custom',
        path: ['secondEndpoint', 'endpoint'],
        message: 'second endpoint required',
      });
    if (trial.firstEndpoint.indicator !== 'phenolphthalein')
      ctx.addIssue({
        code: 'custom',
        path: ['firstEndpoint', 'indicator'],
        message: 'phenolphthalein required',
      });
    if (trial.secondEndpoint.indicator !== 'methyl_orange')
      ctx.addIssue({
        code: 'custom',
        path: ['secondEndpoint', 'indicator'],
        message: 'methyl orange required',
      });
    if (trial.secondEndpoint.buretteReading.value < trial.firstEndpoint.buretteReading.value)
      ctx.addIssue({
        code: 'custom',
        path: ['secondEndpoint', 'buretteReading'],
        message: 'second endpoint reading must not precede first endpoint reading',
      });
  });
export type TitrationTrial = z.infer<typeof TitrationTrialSchema>;

export const TitrationDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('carbonate_hcl_double_endpoint_titration'),
  experimentId: IdSchema,
  definitionVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  experimentNumber: z.literal(36),
  title: z.string().min(1),
  syllabusUnit: z.strictObject({
    unitNumber: z.literal(12),
    title: z.literal('Equilibrium'),
    sourceRefs: TitrationSourceRefsSchema,
  }),
  sourceRefs: TitrationSourceRefsSchema,
  teacherReviewStatus: z.literal('teacher-review-pending'),
  runnable: z.literal(false),
  apparatus: z.array(TitrationApparatusSchema).min(1),
  reagents: z.array(TitrationReagentSchema).min(1),
  supportedCapabilities: z.array(TitrationCapabilitySchema).min(1),
  requiredObservations: z.array(TitrationObservationSchema).min(1),
  endpointRecording: z.strictObject({
    first: z.strictObject({
      indicator: z.literal('phenolphthalein'),
      observation: z.literal('phenolphthalein_pink_to_colourless'),
    }),
    second: z.strictObject({
      indicator: z.literal('methyl_orange'),
      observation: z.literal('methyl_orange_orange_to_red'),
    }),
    sourceRefs: TitrationSourceRefsSchema,
  }),
  repeatedTrials: z.strictObject({
    minimumTrials: z.int().positive(),
    averageRequired: z.boolean(),
    sourceRefs: TitrationSourceRefsSchema,
    reviewStatus: ReviewStatusSchema,
  }),
  assessmentRef: z.strictObject({
    assessmentId: IdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  supportedModes: z.array(ModeSchema).min(1),
});
export type TitrationDefinition = z.infer<typeof TitrationDefinitionSchema>;

export const TitrationMeasurementProvenanceSchema = z.strictObject({
  measurementId: IdSchema,
  quantity: QuantitySchema,
  origin: z.enum(['observed', 'recorded']),
  sourceRefs: TitrationSourceRefsSchema,
});
export type TitrationMeasurementProvenance = z.infer<typeof TitrationMeasurementProvenanceSchema>;

export const TitrationStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('carbonate_hcl_double_endpoint_titration'),
  experimentId: IdSchema,
  definitionVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  preparation: z.enum(['not_started', 'in_progress', 'prepared', 'invalid']),
  glassware: z.strictObject({
    volumetricFlask: z.enum(['not_ready', 'clean', 'ready']),
    pipette: z.enum(['not_ready', 'clean', 'ready']),
    titrationFlask: z.enum(['not_ready', 'clean', 'ready']),
  }),
  burette: z.strictObject({
    capacity: PositiveCapacitySchema,
    state: z.enum(['not_ready', 'rinsed', 'filled', 'air_bubble', 'ready']),
    reading: BuretteReadingSchema,
  }),
  currentTrial: z.int().positive(),
  selectedIndicator: TitrationIndicatorSchema.nullable(),
  firstEndpoint: EndpointRecordSchema.nullable(),
  secondEndpoint: EndpointRecordSchema.nullable(),
  trialHistory: z.array(TitrationTrialSchema),
  measurementProvenance: z.array(TitrationMeasurementProvenanceSchema),
  completion: z.enum(['incomplete', 'ready_for_review', 'submitted']),
});
export type TitrationState = z.infer<typeof TitrationStateSchema>;

export const TitrationActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('record_pipette_volume'), record: PipetteVolumeRecordSchema }),
  z.strictObject({ type: z.literal('rinse_burette'), apparatusId: IdSchema }),
  z.strictObject({ type: z.literal('fill_burette'), apparatusId: IdSchema }),
  z.strictObject({ type: z.literal('remove_burette_air_bubble'), apparatusId: IdSchema }),
  z.strictObject({ type: z.literal('deliver_titrant'), record: TitrantDeliveryRecordSchema }),
  z.strictObject({ type: z.literal('add_indicator'), record: IndicatorAdditionSchema }),
  z.strictObject({ type: z.literal('record_endpoint'), record: EndpointRecordSchema }),
  z.strictObject({ type: z.literal('record_trial'), trial: TitrationTrialSchema }),
]);
export type TitrationAction = z.infer<typeof TitrationActionSchema>;

/**
 * Type-only boundary for a future trusted handler.
 *
 * This module intentionally exports no handler instance or session factory. The active registry
 * must continue to accept only ExperimentDefinition values and registered trusted implementations.
 */
export interface TitrationHandlerContract {
  readonly kind: TitrationDefinition['kind'];
  validateDefinition(definition: TitrationDefinition): readonly string[];
  readonly supportedModes: readonly z.infer<typeof ModeSchema>[];
}
