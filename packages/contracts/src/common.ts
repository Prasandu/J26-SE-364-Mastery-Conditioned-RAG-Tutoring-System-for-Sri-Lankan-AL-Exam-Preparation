import { z } from 'zod';

export const LocaleSchema = z.enum(['en', 'si']);
export type Locale = z.infer<typeof LocaleSchema>;

/** Every unit the M1 simulation may store. Units are never implied by context. */
export const UnitSchema = z.enum(['g', 'kg', 'cm3', 'dm3', 'mol', 'mol dm-3', 'g mol-1']);
export type Unit = z.infer<typeof UnitSchema>;

export const QuantitySchema = z.strictObject({
  value: z.number().finite(),
  unit: UnitSchema,
});
export type Quantity = z.infer<typeof QuantitySchema>;

/** Non-negative mass, labelled. */
export const MassSchema = z.strictObject({
  value: z.number().finite().nonnegative(),
  unit: z.enum(['g', 'kg']),
});
export type Mass = z.infer<typeof MassSchema>;

/** Non-negative volume, labelled. */
export const VolumeSchema = z.strictObject({
  value: z.number().finite().nonnegative(),
  unit: z.enum(['cm3', 'dm3']),
});
export type Volume = z.infer<typeof VolumeSchema>;

export const TranslationStatusSchema = z.enum(['draft', 'reviewed']);
export type TranslationStatus = z.infer<typeof TranslationStatusSchema>;

/** Dotted translation key, e.g. `exp04.stage.weighing.title`. Visible text is never stored inline. */
export const LocKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, 'localisation key');
export type LocKey = z.infer<typeof LocKeySchema>;

export const IdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'snake_case id');

export const ModeSchema = z.enum(['automatic', 'guided', 'manual']);
export type Mode = z.infer<typeof ModeSchema>;

export const GuidanceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type GuidanceLevel = z.infer<typeof GuidanceLevelSchema>;

/** Mode + level combined; keys the mode-specific policies in the assessment file. */
export const GuidanceProfileSchema = z.enum([
  'automatic',
  'guided_beginner',
  'guided_intermediate',
  'guided_advanced',
  'manual',
]);
export type GuidanceProfile = z.infer<typeof GuidanceProfileSchema>;

export const WaterSourceSchema = z.enum(['distilled', 'tap']);
export type WaterSource = z.infer<typeof WaterSourceSchema>;

/** `_meta` block of every locale file. English is canonical source text; Sinhala is a translation. */
export const TranslationMetaSchema = z.strictObject({
  locale: LocaleSchema,
  role: z.enum(['canonical', 'translation']),
  translationStatus: TranslationStatusSchema.nullable(),
  reviewer: z.string().nullable(),
  reviewedOn: z.iso.date().nullable(),
});
export type TranslationMeta = z.infer<typeof TranslationMetaSchema>;
