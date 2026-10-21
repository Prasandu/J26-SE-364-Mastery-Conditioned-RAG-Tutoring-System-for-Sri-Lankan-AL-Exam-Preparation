import { z } from 'zod';

/** Data-only local teaching templates. No scripts, expressions, remote assets or executable URLs. */
export const LocalTextSchema = z.strictObject({
  en: z.string().trim().min(1).max(3000),
  si: z.string().trim().min(1).max(3000),
});
const Identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const ApparatusKindSchema = z.enum([
  'test_tube',
  'boiling_tube',
  'beaker',
  'conical_flask',
  'glass_rod',
  'dropper',
  'reagent_bottle',
  'water_bath',
  'ice_bath',
  'burner',
  'retort_stand',
  'delivery_tube',
  'gas_collector',
  'stopwatch',
]);
export const TeachingColourSchema = z.enum([
  'clear',
  'white',
  'pale_blue',
  'deep_blue',
  'blue',
  'green',
  'pale_green',
  'pink',
  'pale_pink',
  'purple',
  'yellow',
  'orange',
  'red',
  'brown',
  'grey',
]);
export const TeachingSourceSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  pdfPages: z.array(z.int().min(1).max(2000)).max(30),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  url: z
    .string()
    .url()
    .regex(/^https:\/\//)
    .nullable(),
});
const Step = z.strictObject({
  id: Identifier,
  title: LocalTextSchema,
  instruction: LocalTextSchema,
  apparatusId: Identifier,
  effect: z.enum(['prepare', 'add', 'mix', 'heat', 'cool', 'observe', 'measure']),
});
export const TeachingDefinitionSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  id: Identifier,
  revision: z.int().positive().max(100000),
  experimentNumber: z.int().min(1).max(99),
  title: LocalTextSchema,
  unitNumber: z.int().min(1).max(20),
  unitTitle: LocalTextSchema,
  template: z.enum(['reaction_comparison', 'fixed_volume_kinetics']),
  layout: z.enum(['test_tubes', 'gas_collection', 'ice_bath', 'inverted_tube']),
  aims: z.array(LocalTextSchema).min(1).max(12),
  background: LocalTextSchema,
  limitations: LocalTextSchema,
  safety: z.array(LocalTextSchema).min(1).max(12),
  chemicals: z.array(LocalTextSchema).min(1).max(30),
  preLab: z.array(LocalTextSchema).min(1).max(12),
  postLab: z.array(LocalTextSchema).min(1).max(12),
  sources: z.array(TeachingSourceSchema).min(1).max(12),
  apparatus: z
    .array(
      z.strictObject({
        id: Identifier,
        kind: ApparatusKindSchema,
        label: LocalTextSchema,
        capacityCm3: z.number().positive().max(5000).nullable(),
      }),
    )
    .min(1)
    .max(12),
  samples: z
    .array(
      z.strictObject({
        id: Identifier,
        label: LocalTextSchema,
        colour: TeachingColourSchema,
      }),
    )
    .min(1)
    .max(12),
  tests: z
    .array(
      z.strictObject({
        id: Identifier,
        label: LocalTextSchema,
        steps: z.array(Step).min(2).max(16),
        temperatureRangeC: z
          .tuple([z.number().min(-20).max(200), z.number().min(-20).max(200)])
          .nullable(),
      }),
    )
    .min(1)
    .max(12),
  outcomes: z
    .array(
      z.strictObject({
        sampleId: Identifier,
        testId: Identifier,
        observation: LocalTextSchema,
        solutionColour: TeachingColourSchema,
        precipitateColour: TeachingColourSchema.nullable(),
        visual: z.enum(['none', 'bubbles', 'precipitate', 'silver_mirror', 'layers']),
        sourceIndexes: z.array(z.int().nonnegative()).min(1).max(12),
      }),
    )
    .max(144),
  concentrationsMolDm3: z.array(z.number().positive().max(10)).max(8),
  translationStatus: z.literal('draft'),
});
export type TeachingDefinition = z.infer<typeof TeachingDefinitionSchema>;
export type LocalText = z.infer<typeof LocalTextSchema>;
export type TeachingApparatusKind = z.infer<typeof ApparatusKindSchema>;
export type TeachingColour = z.infer<typeof TeachingColourSchema>;

export const TeachingRecordSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  version: z.int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  definition: TeachingDefinitionSchema,
  status: z.enum(['staged', 'local_active']),
  review: z
    .strictObject({ reviewer: z.string().min(1).max(120), date: z.iso.datetime() })
    .nullable(),
});
export type TeachingRecord = z.infer<typeof TeachingRecordSchema>;
export const TeachingSaveSchema = z.strictObject({
  expectedVersion: z.int().positive().nullable(),
  definition: TeachingDefinitionSchema,
});
export const TeachingActivateSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  reviewer: z.string().trim().min(1).max(120),
  reviewedSources: z.literal(true),
});

/** Cross-field checks shared with the API validator; structural schema alone is insufficient. */
export function teachingIssues(d: TeachingDefinition): string[] {
  const issues: string[] = [];
  const unique = (items: readonly { id: string }[]) =>
    new Set(items.map((x) => x.id)).size === items.length;
  if (![d.apparatus, d.samples, d.tests].every(unique)) issues.push('duplicate_id');
  if (new Set(d.apparatus.map(a => a.kind)).size !== d.apparatus.length) issues.push('duplicate_instrument_kind');
  const required = d.layout === 'gas_collection'
    ? ['boiling_tube','retort_stand','burner','delivery_tube','gas_collector','water_bath']
    : d.layout === 'ice_bath' ? ['ice_bath','test_tube']
    : d.layout === 'inverted_tube' ? ['gas_collector','beaker','stopwatch'] : ['test_tube'];
  if (required.some(kind => !d.apparatus.some(a => a.kind === kind))) issues.push('layout_instruments');
  if (d.template === 'fixed_volume_kinetics' && d.layout !== 'inverted_tube') issues.push('kinetics_layout');
  for (const s of d.sources) if (!s.pdfPages.length && !s.url) issues.push('source_reference');
  for (const test of d.tests) {
    if (!unique(test.steps)) issues.push('duplicate_step');
    if (test.steps.some((s) => !d.apparatus.some((a) => a.id === s.apparatusId)))
      issues.push('unknown_apparatus');
    if (test.temperatureRangeC && test.temperatureRangeC[0] > test.temperatureRangeC[1])
      issues.push('temperature_range');
  }
  const seen = new Set<string>();
  for (const o of d.outcomes) {
    if ((o.visual === 'precipitate') !== (o.precipitateColour !== null)) issues.push('precipitate_appearance');
    const key = `${o.sampleId}/${o.testId}`;
    if (seen.has(key)) issues.push('duplicate_outcome');
    seen.add(key);
    if (!d.samples.some((s) => s.id === o.sampleId) || !d.tests.some((t) => t.id === o.testId))
      issues.push('unknown_selection');
    if (o.sourceIndexes.some((i) => !d.sources[i])) issues.push('outcome_source');
  }
  if (d.template === 'reaction_comparison') {
    if (d.concentrationsMolDm3.length) issues.push('unexpected_concentrations');
    for (const s of d.samples)
      for (const t of d.tests) if (!seen.has(`${s.id}/${t.id}`)) issues.push('missing_outcome');
  } else {
    const concentrations = new Set(d.concentrationsMolDm3);
    if (
      concentrations.size !== d.concentrationsMolDm3.length ||
      concentrations.size < 3 ||
      d.outcomes.length ||
      d.samples.length !== 1 ||
      d.tests.length !== 1
    )
      issues.push('kinetics_configuration');
  }
  return [...new Set(issues)];
}
