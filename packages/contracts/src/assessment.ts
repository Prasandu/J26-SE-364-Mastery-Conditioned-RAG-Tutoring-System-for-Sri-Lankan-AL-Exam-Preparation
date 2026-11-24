import { z } from 'zod';
import { ErrorCodeSchema } from './codes';
import { GuidanceProfileSchema, IdSchema, LocKeySchema } from './common';

/**
 * Provisional simulation parameters: values the NIE sources do not provide.
 * They are never presented as NIE facts or official marking criteria.
 */

export const ParameterIdSchema = z.string().regex(/^param\.[a-z0-9_]+$/);
export type ParameterId = z.infer<typeof ParameterIdSchema>;

const RangeSchema = z
  .strictObject({ min: z.number().finite(), max: z.number().finite() })
  .refine((r) => r.min <= r.max, 'min must not exceed max');

export const ParameterSchema = z.strictObject({
  parameterId: ParameterIdSchema,
  value: z.union([z.number().finite(), RangeSchema, z.string().min(1)]),
  unit: z.enum(['g', 'cm3', 'fraction', 'count', 'points', 'weight', 'policy']).nullable(),
  rationale: z.string().min(10),
  sourceType: z.literal('simulation_assumption'),
  reviewStatus: z.literal('teacher_review_pending'),
  effectCategory: z.enum([
    'measurement_tolerance',
    'numeric_consequence',
    'homogeneity',
    'scoring',
    'guidance',
    'automatic_demonstration',
    'initial_state',
  ]),
  version: z.int().positive(),
});
export type Parameter = z.infer<typeof ParameterSchema>;

const ScoreCategorySchema = z.enum([
  'safety',
  'technique',
  'measurement',
  'completeness',
  'independence',
]);
export type ScoreCategory = z.infer<typeof ScoreCategorySchema>;

export const AssessmentDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assessmentId: IdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  experimentId: IdSchema,
  resultLabel: z.literal('practical competency estimate'),
  disclaimerKey: LocKeySchema,
  parameters: z.array(ParameterSchema).min(1),
  /** Engine looks up each value by parameterId; transition code holds no numeric constants. */
  bindings: z.strictObject({
    massTolerance: ParameterIdSchema,
    sliderTolerance: ParameterIdSchema,
    balanceResolution: ParameterIdSchema,
    concentrationRelativeTolerance: ParameterIdSchema,
    watchGlassMassRange: ParameterIdSchema,
    watchGlassResidueFraction: ParameterIdSchema,
    funnelResidueFraction: ParameterIdSchema,
    rinseVolume: ParameterIdSchema,
    eyeLevelVolumeError: ParameterIdSchema,
    requiredInversions: ParameterIdSchema,
    flaskBrimFraction: ParameterIdSchema,
    demoDissolutionWater: ParameterIdSchema,
    demoDropwiseMargin: ParameterIdSchema,
  }),
  scoring: z.strictObject({
    categoryWeights: z.record(ScoreCategorySchema, ParameterIdSchema),
    errorDeductions: z.array(
      z.strictObject({ errorCode: ErrorCodeSchema, parameterId: ParameterIdSchema }),
    ),
    recoveredErrorFactor: ParameterIdSchema,
    hintDeduction: ParameterIdSchema,
    guidanceDeductions: z.record(GuidanceProfileSchema, ParameterIdSchema),
    concentrationOutOfTolerance: ParameterIdSchema,
    concentrationUnavailable: ParameterIdSchema,
  }),
  safetyPolicy: z.record(GuidanceProfileSchema, ParameterIdSchema),
  adaptation: z.strictObject({
    windowActions: ParameterIdSchema,
    errorsToStepDown: ParameterIdSchema,
    cleanActionsToStepUp: ParameterIdSchema,
  }),
});
export type AssessmentDefinition = z.infer<typeof AssessmentDefinitionSchema>;
export { ScoreCategorySchema };
