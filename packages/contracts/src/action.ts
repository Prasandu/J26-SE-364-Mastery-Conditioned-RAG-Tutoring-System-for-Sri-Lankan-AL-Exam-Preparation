import { z } from 'zod';
import { IdSchema, MassSchema, QuantitySchema, VolumeSchema, WaterSourceSchema } from './common';

const GripSchema = z.enum(['neck', 'body']);
const empty = <T extends string>(type: T) => z.strictObject({ type: z.literal(type) });

export const ActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('confirm_safety'),
    checklistItemIds: z.array(IdSchema),
  }),
  z.strictObject({
    type: z.literal('select_apparatus'),
    apparatusIds: z.array(IdSchema).min(1),
  }),
  z.strictObject({
    type: z.literal('clean_glassware'),
    apparatusIds: z.array(IdSchema).min(1),
  }),
  empty('weigh_watch_glass'),
  z.strictObject({ type: z.literal('set_balance_sliders'), mass: MassSchema }),
  z.strictObject({ type: z.literal('add_solid'), mass: MassSchema, handContact: z.boolean() }),
  z.strictObject({ type: z.literal('remove_solid'), mass: MassSchema, handContact: z.boolean() }),
  empty('place_funnel'),
  z.strictObject({
    type: z.literal('transfer_solid'),
    /** Fraction of the weighed solid that enters the funnel; the rest is spilled (lost). */
    fractionIntoFunnel: z.number().gt(0).lte(1),
    handContact: z.boolean(),
  }),
  z.strictObject({ type: z.literal('rinse_watch_glass'), source: WaterSourceSchema }),
  z.strictObject({ type: z.literal('rinse_funnel'), source: WaterSourceSchema }),
  empty('remove_funnel'),
  z.strictObject({ type: z.literal('add_water'), volume: VolumeSchema, source: WaterSourceSchema }),
  z.strictObject({ type: z.literal('stopper_flask'), inserted: z.boolean() }),
  z.strictObject({ type: z.literal('dissolve_solute'), grip: GripSchema }),
  z.strictObject({
    type: z.literal('adjust_to_mark'),
    source: WaterSourceSchema,
    eyeLevel: z.enum(['level', 'above', 'below']),
  }),
  z.strictObject({
    type: z.literal('mix_solution'),
    inversions: z.int().min(1).max(100),
    grip: GripSchema,
  }),
  z.strictObject({
    type: z.literal('apply_label'),
    solutionName: z.string().max(80),
    concentration: QuantitySchema.nullable(),
    preparationDate: z.iso.date().nullable(),
  }),
  empty('request_hint'),
  empty('submit_experiment'),
  empty('restart_experiment'),
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

export const ActorSchema = z.enum(['student', 'system']);

export const ActionEnvelopeSchema = z.strictObject({
  action: ActionSchema,
  actor: ActorSchema,
  /** Milliseconds since session start; supplied by the caller so the engine stays pure. */
  elapsedMs: z.int().nonnegative(),
  acknowledgedSafetyWarning: z.boolean(),
});
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;
