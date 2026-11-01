import { z } from 'zod';

export const StageIdSchema = z.enum([
  'safety',
  'setup',
  'weighing',
  'transfer',
  'dissolution',
  'make_up',
  'mixing',
  'labelling',
  'review',
  'complete',
]);
export type StageId = z.infer<typeof StageIdSchema>;

export const ActionTypeSchema = z.enum([
  'confirm_safety',
  'select_apparatus',
  'clean_glassware',
  'weigh_watch_glass',
  'set_balance_sliders',
  'add_solid',
  'remove_solid',
  'place_funnel',
  'transfer_solid',
  'rinse_watch_glass',
  'rinse_funnel',
  'remove_funnel',
  'add_water',
  'stopper_flask',
  'dissolve_solute',
  'adjust_to_mark',
  'mix_solution',
  'apply_label',
  'request_hint',
  'submit_experiment',
  'restart_experiment',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ErrorCategorySchema = z.enum([
  'safety_violation',
  'technique_error',
  'measurement_error',
  'completion_error',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorCodeSchema = z.enum([
  // safety
  'SAFETY_NOT_CONFIRMED',
  'SAFETY_CHECKLIST_INCOMPLETE',
  'CHEMICAL_SKIN_CONTACT',
  // technique
  'DIRTY_FLASK_USED',
  'DIRTY_GLASSWARE_USED',
  'INCOMPLETE_TRANSFER',
  'WATCH_GLASS_NOT_RINSED',
  'FUNNEL_NOT_RINSED',
  'UNDISSOLVED_AT_MARK',
  'TAP_WATER_USED',
  'INSUFFICIENT_MIXING',
  'FLASK_HELD_BY_BODY',
  // measurement
  'SLIDER_SETTING_INCORRECT',
  'MASS_OUT_OF_TOLERANCE',
  'WRONG_FLASK_CAPACITY',
  'OVERSHOOT_MARK',
  'EYE_LEVEL_INCORRECT',
  // completion
  'LABEL_MISSING',
  'LABEL_INCORRECT',
  'INCOMPLETE_PROCEDURE',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** How an accepted-but-wrong action affects the prepared solution. */
export const ConsequenceSchema = z.enum([
  'numeric_mass',
  'numeric_volume',
  'purity_risk',
  'homogeneity_risk',
  'volume_validity',
  'technique_only',
  'completion',
  'safety',
]);

export const RecoverabilitySchema = z.enum([
  'recoverable',
  'not_correctable',
  'numeric_consequence',
  'restart_required',
]);
export type Recoverability = z.infer<typeof RecoverabilitySchema>;

/** Physical preconditions; when one fails the action is rejected without mutating lab state. */
export const PreconditionIdSchema = z.enum([
  'not_submitted',
  'apparatus_known',
  'apparatus_selected',
  'glassware_cleanable_and_empty',
  'flask_selected',
  'flask_switch_allowed',
  'watch_glass_on_balance',
  'transfer_not_started',
  'solid_on_watch_glass',
  'sufficient_solid',
  'funnel_on_flask',
  'funnel_not_on_flask',
  'flask_unstoppered',
  'flask_stoppered',
  'stopper_state_changes',
  'flask_has_liquid',
  'flask_has_solute',
  'below_mark',
  'within_brim',
]);
export type PreconditionId = z.infer<typeof PreconditionIdSchema>;

export const RejectionCodeSchema = z.enum([
  ...PreconditionIdSchema.options,
  'invalid_envelope',
  'safety_acknowledgement_required',
]);
export type RejectionCode = z.infer<typeof RejectionCodeSchema>;

export const ObservationIdSchema = z.enum([
  'pointer_below_zero',
  'pointer_at_zero',
  'pointer_above_zero',
  'solid_in_flask_undissolved',
  'solid_dissolved',
  'liquid_below_mark',
  'meniscus_at_mark',
  'liquid_above_mark',
  'solution_homogeneous',
  'solid_spilled',
]);
export type ObservationId = z.infer<typeof ObservationIdSchema>;

export const MeasurementIdSchema = z.enum([
  'watch_glass_mass',
  'balance_slider_setting',
  'weighed_solute_mass',
  'transferred_solute_mass',
  'final_volume',
  'achieved_concentration',
]);
export type MeasurementId = z.infer<typeof MeasurementIdSchema>;
