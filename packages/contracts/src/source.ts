import { z } from 'zod';

/** The only documents the simulator, content and assistant may cite (normalized filenames). */
export const SourceIdSchema = z.enum([
  'nie-handbook-2018',
  'nie-rb-g12-en',
  'nie-syllabus-2017',
  'proposal-c01',
]);
export type SourceId = z.infer<typeof SourceIdSchema>;

export const SourceFilenameSchema = z.enum([
  'nie-chemistry-practical-handbook-2018.pdf',
  'nie-grade-12-chemistry-resource-book-en.pdf',
  'nie-al-chemistry-syllabus-2017.pdf',
  'component-01-virtual-lab-proposal.pdf',
]);

/** Fact IDs match rows in docs/SOURCE_MAP.md (E = Exp 4, S = safety, V = apparatus technique). */
export const FactIdSchema = z.string().regex(/^[ESVP]\d+$/, 'SOURCE_MAP fact id');

export const SourceRefSchema = z.strictObject({
  sourceId: SourceIdSchema,
  factId: FactIdSchema,
  pdfPage: z.int().positive(),
  printedPage: z.int().positive().nullable(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const SourceRefsSchema = z.array(SourceRefSchema).min(1);

export const SourceDocumentSchema = z.strictObject({
  sourceId: SourceIdSchema,
  filename: SourceFilenameSchema,
  titleKey: z.string(),
  edition: z.string(),
  kind: z.enum(['nie_official', 'project_material']),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const SourceFactSchema = z.strictObject({
  factId: FactIdSchema,
  sourceId: SourceIdSchema,
  pdfPage: z.int().positive(),
  printedPage: z.int().positive().nullable(),
});

export const SourceRegistrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  documents: z.array(SourceDocumentSchema).length(4),
  facts: z.array(SourceFactSchema).min(1),
});
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;
