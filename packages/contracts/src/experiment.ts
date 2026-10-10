import { z } from 'zod';
import {
  ActionTypeSchema,
  ConsequenceSchema,
  ErrorCategorySchema,
  ErrorCodeSchema,
  MeasurementIdSchema,
  ObservationIdSchema,
  PreconditionIdSchema,
  RecoverabilitySchema,
  StageIdSchema,
} from './codes';
import { ParameterIdSchema } from './assessment';
import { IdSchema, LocKeySchema, QuantitySchema } from './common';
import { SourceRefsSchema } from './source';

/**
 * ExperimentDefinition v1.
 *
 * Pure data: no executable code. Chemistry-bearing entries carry `sourceRefs` (min 1); all visible
 * text is a localisation key. Values absent from NIE sources live in the assessment file instead.
 */

export const SourcedQuantitySchema = z.strictObject({
  quantity: QuantitySchema,
  sourceRefs: SourceRefsSchema,
});

const ApparatusKindSchema = z.enum([
  'volumetric_flask',
  'beaker',
  'funnel',
  'watch_glass',
  'balance',
  'wash_bottle',
  'dropper',
]);
export type ApparatusKind = z.infer<typeof ApparatusKindSchema>;

export const ApparatusSchema = z.strictObject({
  id: IdSchema,
  kind: ApparatusKindSchema,
  nameKey: LocKeySchema,
  role: z.enum(['required', 'optional', 'distractor']),
  capacity: SourcedQuantitySchema.nullable(),
  requiresCleaning: z.boolean(),
  sourceRefs: SourceRefsSchema,
});

export const ChemicalSchema = z.strictObject({
  id: IdSchema,
  nameKey: LocKeySchema,
  formula: z.string().min(1),
  physicalState: z.enum(['solid', 'liquid']),
  role: z.enum(['solute', 'solvent', 'incorrect_solvent']),
  molarMass: SourcedQuantitySchema.nullable(),
  sourceRefs: SourceRefsSchema,
});

export const SafetyRuleSchema = z.strictObject({
  id: IdSchema,
  textKey: LocKeySchema,
  kind: z.enum(['checklist', 'handling']),
  violationCode: ErrorCodeSchema.nullable(),
  sourceRefs: SourceRefsSchema,
});

export const StageSchema = z.strictObject({
  id: StageIdSchema,
  titleKey: LocKeySchema,
  goalKey: LocKeySchema,
  sourceRefs: SourceRefsSchema,
});

export const ActionSpecSchema = z.strictObject({
  type: ActionTypeSchema,
  labelKey: LocKeySchema,
  sourceRefs: SourceRefsSchema,
});

export const TransitionRuleSchema = z.strictObject({
  action: ActionTypeSchema,
  requiresApparatus: z.array(ApparatusKindSchema),
  preconditions: z.array(PreconditionIdSchema),
  sourceRefs: SourceRefsSchema,
});

export const CanonicalStepIdSchema = z.enum([
  'confirm_safety',
  'select_apparatus',
  'clean_glassware',
  'weigh_watch_glass',
  'set_balance_sliders',
  'add_solid',
  'place_funnel',
  'transfer_solid',
  'rinse_watch_glass',
  'rinse_funnel',
  'remove_funnel',
  'add_dissolution_water',
  'stopper_for_dissolution',
  'dissolve_solute',
  'unstopper_for_make_up',
  'add_water_near_mark',
  'adjust_to_mark',
  'stopper_for_mixing',
  'mix_solution',
  'apply_label',
  'submit_experiment',
]);
export type CanonicalStepId = z.infer<typeof CanonicalStepIdSchema>;

export const ProcedureStepSchema = z.strictObject({
  stepId: CanonicalStepIdSchema,
  stage: StageIdSchema,
  action: ActionTypeSchema,
  instructionKey: LocKeySchema,
  hintKey: LocKeySchema,
  sourceRefs: SourceRefsSchema,
  parameterIds: z.array(ParameterIdSchema),
});

export const ObservationRuleSchema = z.strictObject({
  id: ObservationIdSchema,
  kind: z.enum(['balance_pointer', 'dissolution', 'volume_level', 'homogeneity', 'loss']),
  textKey: LocKeySchema,
  sourceRefs: SourceRefsSchema,
});

export const MeasurementRuleSchema = z.strictObject({
  id: MeasurementIdSchema,
  kind: z.enum(['mass', 'volume', 'concentration']),
  unit: z.enum(['g', 'cm3', 'mol dm-3']),
  method: z.enum(['balance_reading', 'flask_mark', 'calculated']),
  /** Named formula implemented in simulation-core; never executable text. */
  formulaId: z.enum(['concentration_from_mass_and_volume']).nullable(),
  descriptionKey: LocKeySchema,
  parameterIds: z.array(ParameterIdSchema),
  sourceRefs: SourceRefsSchema,
});

export const ErrorRuleSchema = z.strictObject({
  code: ErrorCodeSchema,
  category: ErrorCategorySchema,
  consequence: ConsequenceSchema,
  recoverability: RecoverabilitySchema,
  messageKey: LocKeySchema,
  explanationKey: LocKeySchema,
  parameterIds: z.array(ParameterIdSchema),
  sourceRefs: SourceRefsSchema,
});

export const CalculationStepSchema = z.strictObject({
  id: IdSchema,
  stepKey: LocKeySchema,
  result: SourcedQuantitySchema,
});

export const ExpectedResultsSchema = z.strictObject({
  soluteChemicalId: IdSchema,
  solventChemicalId: IdSchema,
  targetVolume: SourcedQuantitySchema,
  targetConcentration: SourcedQuantitySchema,
  requiredAmount: SourcedQuantitySchema,
  targetMass: SourcedQuantitySchema,
  calculations: z.array(CalculationStepSchema).min(1),
  label: z.strictObject({
    requiredFields: z.array(z.enum(['solution_name', 'concentration', 'preparation_date'])).min(1),
    /** Normalized (lower-case, no spaces/subscripts) names accepted on the label. */
    acceptedSolutionNames: z.array(z.string().regex(/^[a-z0-9]+$/)).min(1),
    sourceRefs: SourceRefsSchema,
  }),
});

const AnswerGuideSchema = z.strictObject({
  answerKey: LocKeySchema,
  basis: z.enum(['source', 'derived_from_source']),
  sourceRefs: SourceRefsSchema,
});

export const QuestionSchema = z.strictObject({
  id: IdSchema,
  promptKey: LocKeySchema,
  sourceRefs: SourceRefsSchema,
  /** null when the approved pages do not support an answer (see SOURCE_MAP gap register). */
  answerGuide: AnswerGuideSchema.nullable(),
  revealAnswerAfter: z.literal('submission'),
});

const TextItemSchema = z.strictObject({
  id: IdSchema,
  textKey: LocKeySchema,
  sourceRefs: SourceRefsSchema,
});

const StandardSolutionByMassSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('standard_solution_by_mass'),
  experimentId: IdSchema,
  definitionVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  experimentNumber: z.int().positive(),
  titleKey: LocKeySchema,
  syllabusUnit: z.strictObject({
    unitNumber: z.int().positive(),
    titleKey: LocKeySchema,
    competency: z.string().regex(/^\d+\.\d+$/),
    sourceRefs: SourceRefsSchema,
  }),
  sourceRefs: SourceRefsSchema,
  learningObjectives: z.array(TextItemSchema).min(1),
  prerequisites: z.array(TextItemSchema),
  apparatus: z.array(ApparatusSchema).min(1),
  chemicals: z.array(ChemicalSchema).min(1),
  safetyRules: z.array(SafetyRuleSchema).min(1),
  initialState: z.strictObject({
    glassware: z.array(
      z.strictObject({ apparatusId: IdSchema, cleanliness: z.enum(['dirty', 'clean']) }),
    ),
    sourceRefs: SourceRefsSchema,
  }),
  stages: z.array(StageSchema).min(1),
  availableActions: z.array(ActionSpecSchema).min(1),
  transitionRules: z.array(TransitionRuleSchema).min(1),
  procedure: z.array(ProcedureStepSchema).min(1),
  observations: z.array(ObservationRuleSchema),
  measurementRules: z.array(MeasurementRuleSchema).min(1),
  errorRules: z.array(ErrorRuleSchema).min(1),
  expectedResults: ExpectedResultsSchema,
  assessmentRef: z.strictObject({
    assessmentId: IdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  preLabQuestions: z.array(QuestionSchema),
  postLabQuestions: z.array(QuestionSchema),
  localisationKeys: z.array(LocKeySchema).min(1),
});

export const ExperimentDefinitionSchema = z.discriminatedUnion('kind', [
  StandardSolutionByMassSchema,
]);
export type ExperimentDefinition = z.infer<typeof ExperimentDefinitionSchema>;
export type ErrorRule = z.infer<typeof ErrorRuleSchema>;
export type ProcedureStep = z.infer<typeof ProcedureStepSchema>;
export type Apparatus = z.infer<typeof ApparatusSchema>;
