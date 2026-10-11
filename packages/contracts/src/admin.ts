import { z } from 'zod';

/**
 * Development-only practical administration (drafts and review). There is no publishing,
 * catalog replacement or rollback in this contract: a content-approved draft is never runnable.
 */

export const ADMIN_LIST_FIELDS = [
  'aims',
  'apparatus',
  'chemicals',
  'procedure',
  'precautions',
  'calculations',
  'observations',
  'preLabQuestions',
  'postLabQuestions',
] as const;
export const ADMIN_FIELDS = [
  'experimentNumber',
  'title',
  'syllabusUnit',
  ...ADMIN_LIST_FIELDS,
] as const;

export const AdminFieldSchema = z.enum(ADMIN_FIELDS);
export type AdminField = z.infer<typeof AdminFieldSchema>;

const IdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const ShaSchema = z.string().regex(/^[0-9a-f]{64}$/);
const Item = z.string().min(1).max(2000);
const ItemList = z.array(Item).max(100);
const Timestamp = z.iso.datetime();

export const AdminDraftStatusSchema = z.enum([
  'draft',
  'needs_review',
  'content_approved',
  'archived',
]);
export type AdminDraftStatus = z.infer<typeof AdminDraftStatusSchema>;

export const AdminDraftContentSchema = z.strictObject({
  experimentNumber: z.int().min(1).max(99).nullable(),
  title: z.string().min(1).max(300).nullable(),
  syllabusUnit: z.string().min(1).max(300).nullable(),
  aims: ItemList,
  apparatus: ItemList,
  chemicals: ItemList,
  procedure: ItemList,
  precautions: ItemList,
  calculations: ItemList,
  observations: ItemList,
  preLabQuestions: ItemList,
  postLabQuestions: ItemList,
});
export type AdminDraftContent = z.infer<typeof AdminDraftContentSchema>;

export const AdminIssueSchema = z.strictObject({
  code: z.string().min(1).max(64),
  field: z.string().max(64),
  message: z.string().max(300),
});

export const AdminDraftSchema = z.strictObject({
  id: IdSchema,
  version: z.int().positive(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  importId: IdSchema,
  status: AdminDraftStatusSchema,
  content: AdminDraftContentSchema,
  sourcePages: z.record(z.string(), z.array(z.int().positive()).max(400)),
  fieldReview: z.record(z.string(), z.boolean()),
  fieldEdited: z.record(z.string(), z.boolean()),
  extractionIssues: z.array(AdminIssueSchema).max(200),
  provenance: z.strictObject({
    sourceSha256: ShaSchema,
    documentName: z.string().min(1).max(120),
    importKind: z.enum(['guide', 'single']),
    extractorVersion: z.string().min(1).max(64),
    pageRange: z.tuple([z.int().nonnegative(), z.int().nonnegative()]),
  }),
  translation: z.strictObject({ si: z.enum(['not_started', 'draft', 'teacher_review_pending']) }),
});
export type AdminDraft = z.infer<typeof AdminDraftSchema>;

export const AdminDuplicateSchema = z.strictObject({
  kind: z.enum(['published', 'draft', 'document']),
  experimentNumber: z.int().min(1).max(99),
  otherId: z.string().max(64),
  otherTitle: z.string().max(300).nullable(),
  conflictingTitle: z.boolean(),
  blocking: z.boolean(),
});

export const AdminValidationSchema = z.strictObject({
  contentComplete: z.boolean(),
  missingFields: z.array(AdminFieldSchema),
  provenanceOk: z.boolean(),
  provenanceIssues: z.array(z.string().max(64)),
  duplicates: z.array(AdminDuplicateSchema),
  sinhalaReview: z.enum(['not_started', 'draft', 'teacher_review_pending']),
  reviewComplete: z.boolean(),
  unreviewedFields: z.array(AdminFieldSchema),
  simulation: z.strictObject({
    status: z.literal('simulation_pending'),
    reason: z.enum(['no_validated_definition', 'unsupported_type']),
    supportedKinds: z.array(z.string()),
  }),
  /** Always false in this slice: content approval never makes a practical runnable. */
  runnable: z.literal(false),
  canApproveContent: z.boolean(),
  blocking: z.array(z.string().max(64)),
  warnings: z.array(z.string().max(64)),
});
export type AdminValidation = z.infer<typeof AdminValidationSchema>;

export const AdminDraftSummarySchema = z.strictObject({
  id: IdSchema,
  version: z.int().positive(),
  status: AdminDraftStatusSchema,
  experimentNumber: z.int().min(1).max(99).nullable(),
  title: z.string().max(300).nullable(),
  syllabusUnit: z.string().max(300).nullable(),
  documentName: z.string().max(120),
  importId: IdSchema,
  updatedAt: Timestamp,
  validation: z.strictObject({
    contentComplete: z.boolean(),
    blockingCount: z.int().nonnegative(),
    warningCount: z.int().nonnegative(),
    canApproveContent: z.boolean(),
    simulation: z.literal('simulation_pending'),
  }),
});
export type AdminDraftSummary = z.infer<typeof AdminDraftSummarySchema>;

export const AdminDraftDetailSchema = z.strictObject({
  draft: AdminDraftSchema,
  validation: AdminValidationSchema,
});
export type AdminDraftDetail = z.infer<typeof AdminDraftDetailSchema>;

export const AdminImportSchema = z.strictObject({
  id: IdSchema,
  version: z.int().positive(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  kind: z.enum(['guide', 'single']),
  documentName: z.string().min(1).max(120),
  sourceSha256: ShaSchema,
  sizeBytes: z.int().positive(),
  pageCount: z.int().positive(),
  extractorVersion: z.string().min(1).max(64),
  draftIds: z.array(IdSchema),
});
export type AdminImport = z.infer<typeof AdminImportSchema>;

export const AdminImportResultSchema = z.strictObject({
  import: AdminImportSchema,
  drafts: z.array(AdminDraftSummarySchema),
});
export type AdminImportResult = z.infer<typeof AdminImportResultSchema>;

export const AdminStatusSchema = z.strictObject({
  mode: z.literal('development'),
  limits: z.strictObject({ maxUploadBytes: z.int().positive(), maxPages: z.int().positive() }),
  counts: z.strictObject({
    drafts: z.int().nonnegative(),
    needsReview: z.int().nonnegative(),
    contentApproved: z.int().nonnegative(),
    validationFailures: z.int().nonnegative(),
    imports: z.int().nonnegative(),
  }),
  operations: z.array(z.enum(['import_guide', 'import_single', 'edit', 'validate', 'review'])),
});
export type AdminStatus = z.infer<typeof AdminStatusSchema>;

export const AdminDraftUpdateRequestSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  content: AdminDraftContentSchema,
  /** PDF pages supporting each list field; checked server-side against the source document. */
  sourcePages: z.record(z.string(), z.array(z.int().positive().max(400)).max(400)),
});
export type AdminDraftUpdateRequest = z.infer<typeof AdminDraftUpdateRequestSchema>;

export const AdminReviewActionSchema = z.enum([
  'mark_field',
  'submit_for_review',
  'approve_content',
  'return_to_draft',
  'archive',
]);
export type AdminReviewAction = z.infer<typeof AdminReviewActionSchema>;

export const AdminReviewRequestSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  action: AdminReviewActionSchema,
  field: AdminFieldSchema.nullable(),
  reviewed: z.boolean().nullable(),
});
export type AdminReviewRequest = z.infer<typeof AdminReviewRequestSchema>;
