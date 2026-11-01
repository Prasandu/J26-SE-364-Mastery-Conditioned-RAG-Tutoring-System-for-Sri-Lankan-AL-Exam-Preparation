import { z } from 'zod';
import { ScoreCategorySchema } from './assessment';
import { ErrorCodeSchema, RecoverabilitySchema } from './codes';
import { GuidanceLevelSchema, ModeSchema, QuantitySchema } from './common';
import { SourceRefSchema } from './source';

export const DeductionSchema = z.strictObject({
  reason: z.union([
    ErrorCodeSchema,
    z.enum([
      'hint_used',
      'guidance_support',
      'concentration_out_of_tolerance',
      'concentration_unavailable',
    ]),
  ]),
  points: z.number().nonnegative(),
  parameterIds: z.array(z.string()).min(1),
  /** Domain events that evidence this deduction; never empty. */
  eventSeqs: z.array(z.int().nonnegative()).min(1),
  resolved: z.boolean(),
  sourceRefs: z.array(SourceRefSchema),
});
export type Deduction = z.infer<typeof DeductionSchema>;

export const CategoryScoreSchema = z.strictObject({
  category: ScoreCategorySchema,
  /** null when the category is not assessed (e.g. independence in automatic demonstration). */
  score: z.number().min(0).max(100).nullable(),
  weightParameterId: z.string(),
  deductions: z.array(DeductionSchema),
});

export const ReportSchema = z.strictObject({
  sessionId: z.string(),
  experimentId: z.string(),
  definitionVersion: z.string(),
  mode: ModeSchema,
  guidanceLevel: GuidanceLevelSchema.nullable(),
  attempt: z.int().positive(),
  resultLabel: z.literal('practical competency estimate'),
  disclaimerKey: z.string(),
  assessmentVersion: z.string(),
  categories: z.array(CategoryScoreSchema).length(5),
  overall: z.number().min(0).max(100).nullable(),
  measurements: z.strictObject({
    targetConcentration: QuantitySchema,
    weighedMass: QuantitySchema.nullable(),
    transferredMass: QuantitySchema,
    finalVolume: QuantitySchema.nullable(),
    achievedConcentration: QuantitySchema.nullable(),
    concentrationUnavailableReason: z.enum(['not_made_up', 'volume_invalid']).nullable(),
    absoluteError: QuantitySchema.nullable(),
    relativeError: z.number().nullable(),
  }),
  validity: z.strictObject({
    purityRisks: z.array(ErrorCodeSchema),
    homogeneity: z.string(),
    volumeValidity: z.string(),
    restartRequired: z.boolean(),
  }),
  completion: z.enum(['submitted', 'incomplete']),
  hints: z.int().nonnegative(),
  retries: z.int().nonnegative(),
  elapsedMs: z.int().nonnegative(),
  actionSequence: z.array(z.string()),
  errorSummary: z.strictObject({
    /** Recoverable errors the learner later corrected. */
    recovered: z.array(
      z.strictObject({
        code: ErrorCodeSchema,
        raisedSeq: z.int().nonnegative(),
        resolvedSeq: z.int().nonnegative(),
      }),
    ),
    /** Errors still standing at the end of the attempt. */
    unresolved: z.array(
      z.strictObject({
        code: ErrorCodeSchema,
        seq: z.int().nonnegative(),
        recoverability: RecoverabilitySchema,
      }),
    ),
  }),
  /** Every provisional (simulation_assumption, teacher-review-pending) parameter that affected this attempt. */
  provisionalParameterIds: z.array(z.string()),
  /** Source references behind the experiment targets and every recorded error. */
  sourceRefs: z.array(SourceRefSchema),
  /** Fingerprint of the last event: the report is valid for exactly this event chain. */
  headFingerprint: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;
