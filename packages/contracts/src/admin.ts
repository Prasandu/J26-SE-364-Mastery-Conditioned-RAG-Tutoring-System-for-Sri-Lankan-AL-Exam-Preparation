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
/** One list item. Imports split longer paragraphs at sentences (about 1000 characters). */
const Item = z.string().min(1).max(8000);
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

export const AdminSuggestionSchema = z.strictObject({
  text: z.string().min(1).max(600),
  page: z.int().positive(),
  quote: z.string().min(1).max(600),
});
export type AdminSuggestion = z.infer<typeof AdminSuggestionSchema>;

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
  /** Content duplicates a reviewer recorded as genuinely different practicals. */
  distinctFrom: z.array(IdSchema).max(100).optional(),
  /** Local AI suggestions (verified quotes with pages); never applied automatically. */
  suggestions: z.record(z.string(), z.array(AdminSuggestionSchema).max(60)).optional(),
  /** Required list fields a reviewer confirmed are not given in the source document. */
  absentConfirmed: z.array(z.enum(ADMIN_LIST_FIELDS)).max(9).optional(),
  /** Approved with "Approve now" (all fields confirmed at once by the admin). */
  quickApproved: z.boolean().optional(),
  /** Repairs applied by the last Quick fix (for example "cleaned:procedure"). */
  quickFixLog: z.array(z.string().max(64)).max(60).optional(),
});
export type AdminDraft = z.infer<typeof AdminDraftSchema>;

export const AdminDuplicateSchema = z.strictObject({
  kind: z.enum(['published', 'draft', 'document', 'content']),
  experimentNumber: z.int().min(1).max(99).nullable(),
  otherId: z.string().max(64),
  otherTitle: z.string().max(300).nullable(),
  conflictingTitle: z.boolean(),
  /** Word-shingle similarity of the experimental content (null for number-only matches). */
  similarity: z.number().min(0).max(1).nullable(),
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
  licenceNote: z.string().max(500).optional(),
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
  operations: z.array(
    z.enum([
      'import_guide',
      'import_single',
      'edit',
      'validate',
      'review',
      'knowledge_build',
      'users',
      'audit',
      'assist',
    ]),
  ),
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
  'mark_distinct',
  'quick_fix',
  'quick_approve',
]);
export type AdminReviewAction = z.infer<typeof AdminReviewActionSchema>;

export const AdminReviewRequestSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  action: AdminReviewActionSchema,
  field: AdminFieldSchema.nullable(),
  reviewed: z.boolean().nullable(),
  /** mark_distinct: the content duplicate being dismissed. */
  otherId: z.string().max(64).nullable().optional(),
});
export type AdminReviewRequest = z.infer<typeof AdminReviewRequestSchema>;

/* ------------------------------------------------------------------ knowledge base */
const VersionId = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/);

export const AdminKnowledgeBuildSchema = z.strictObject({
  id: IdSchema,
  version: z.int().positive(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  status: z.enum(['staged', 'active', 'superseded']),
  knowledgeVersion: VersionId,
  baseVersion: VersionId.nullable(),
  draftIds: z.array(IdSchema).max(50),
  chunkCount: z.int().nonnegative(),
  carriedChunks: z.int().nonnegative(),
  newChunks: z.int().nonnegative(),
  skippedExact: z.int().nonnegative(),
  skippedNear: z.int().nonnegative(),
  embeddingModel: z.string().max(120),
  modelRevision: z.string().max(120),
  checks: z.array(
    z.strictObject({ draftId: IdSchema, query: z.string().max(300), hit: z.boolean() }),
  ),
  checkPassed: z.boolean(),
});
export type AdminKnowledgeBuild = z.infer<typeof AdminKnowledgeBuildSchema>;

export const AdminKnowledgeSchema = z.strictObject({
  available: z.boolean(),
  reason: z.enum(['embedding_provider_disabled', 'repository_unavailable']).nullable(),
  repository: z.enum(['memory', 'postgres']),
  embeddingProvider: z.enum(['disabled', 'fake', 'e5_local']),
  embeddingModel: z.string().max(120),
  baseVersion: VersionId.nullable(),
  active: z
    .strictObject({
      knowledgeVersion: VersionId,
      chunkCount: z.int().nonnegative(),
      embeddingModel: z.string().max(120),
    })
    .nullable(),
  builds: z.array(AdminKnowledgeBuildSchema),
});
export type AdminKnowledge = z.infer<typeof AdminKnowledgeSchema>;

export const AdminKnowledgeBuildRequestSchema = z.strictObject({
  draftIds: z.array(IdSchema).min(1).max(50),
});
export type AdminKnowledgeBuildRequest = z.infer<typeof AdminKnowledgeBuildRequestSchema>;

export const AdminKnowledgeActivateRequestSchema = z.strictObject({ knowledgeVersion: VersionId });
export type AdminKnowledgeActivateRequest = z.infer<typeof AdminKnowledgeActivateRequestSchema>;

export const AdminKnowledgeChunksSchema = z
  .array(
    z.strictObject({
      chunkId: z.string().regex(/^kc_[0-9a-f]{20}$/),
      documentTitle: z.string().max(300),
      pdfPage: z.int().positive(),
      heading: z.string().max(600),
      experimentId: z.string().max(80).nullable(),
      tokenCount: z.int().positive(),
      text: z.string().max(8000),
    }),
  )
  .max(500);
export type AdminKnowledgeChunks = z.infer<typeof AdminKnowledgeChunksSchema>;

/* ------------------------------------------------------------------ practical library */
export const AdminLibrarySchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      kind: z.enum(['published', 'draft']),
      id: z.string().max(64),
      experimentNumber: z.int().min(1).max(99).nullable(),
      title: z.string().max(300),
      status: z.enum(['published', 'draft', 'needs_review', 'content_approved']),
      runnable: z.boolean(),
      knowledgeChunks: z.int().nonnegative(),
      sinhala: z.string().max(40),
      blockers: z.array(z.string().max(64)).max(30),
    }),
  ),
  rule: z.string().max(200),
});
export type AdminLibrary = z.infer<typeof AdminLibrarySchema>;

/* ------------------------------------------------------------------ users (no login yet) */
export const AdminRoleSchema = z.enum(['student', 'teacher', 'admin']);
export const AdminUserStatusSchema = z.enum(['active', 'disabled']);

export const AdminUserSchema = z.strictObject({
  id: IdSchema,
  version: z.int().positive(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  displayName: z.string().min(2).max(60),
  role: AdminRoleSchema,
  status: AdminUserStatusSchema,
  note: z.string().max(300),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUsersSchema = z.strictObject({
  users: z.array(AdminUserSchema),
  learnerData: z.array(
    z.strictObject({
      ownerId: z.string().max(120),
      sessions: z.int().nonnegative(),
      submitted: z.int().nonnegative(),
      lastStartedOn: z.string().max(10),
    }),
  ),
  /** There is no login yet: roles are recorded, not enforced. */
  rolesEnforced: z.literal(false),
});
export type AdminUsers = z.infer<typeof AdminUsersSchema>;

export const AdminUserRequestSchema = z.strictObject({
  expectedVersion: z.int().positive().nullable(),
  displayName: z.string().min(2).max(60),
  role: AdminRoleSchema,
  status: AdminUserStatusSchema,
  note: z.string().max(300),
});
export type AdminUserRequest = z.infer<typeof AdminUserRequestSchema>;

/* ------------------------------------------------------------------ source documents */
export const AdminDocumentsSchema = z.array(
  z.strictObject({
    importId: IdSchema,
    version: z.int().positive(),
    documentName: z.string().max(120),
    sourceSha256: ShaSchema,
    kind: z.enum(['guide', 'single']),
    pageCount: z.int().positive(),
    sizeBytes: z.int().positive(),
    importedAt: Timestamp,
    drafts: z.int().nonnegative(),
    fileOk: z.boolean(),
    licenceNote: z.string().max(500),
  }),
);
export type AdminDocuments = z.infer<typeof AdminDocumentsSchema>;

export const AdminDocumentUpdateRequestSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  licenceNote: z.string().max(500),
});
export type AdminDocumentUpdateRequest = z.infer<typeof AdminDocumentUpdateRequestSchema>;

/* ------------------------------------------------------------------ translations */
export const AdminTranslationsSchema = z.array(
  z.strictObject({
    file: z.string().max(40),
    keys: z.int().nonnegative(),
    translated: z.int().nonnegative(),
    status: z.enum(['draft', 'reviewed']),
    reviewer: z.string().max(120).nullable(),
    reviewedOn: z.string().max(10).nullable(),
  }),
);
export type AdminTranslations = z.infer<typeof AdminTranslationsSchema>;

/* ------------------------------------------------------------------ audit + settings */
export const AdminAuditSchema = z.strictObject({
  events: z
    .array(
      z.strictObject({
        seq: z.int().positive(),
        at: Timestamp,
        actor: z.string().max(60),
        action: z.string().max(64),
        targetKind: z.string().max(20).nullable(),
        targetId: z.string().max(64).nullable(),
        details: z.record(z.string(), z.unknown()),
        prev: ShaSchema.or(z.literal('0'.repeat(64))),
        hash: ShaSchema,
      }),
    )
    .max(200),
  /** The hash chain verifies from the first event (tamper evidence). */
  chainOk: z.boolean(),
});
export type AdminAudit = z.infer<typeof AdminAuditSchema>;

export const AdminSettingsSchema = z.strictObject({
  environment: z.enum(['development', 'test', 'production']),
  adminRepository: z.enum(['file', 'postgres']),
  knowledgeRepository: z.enum(['memory', 'postgres']),
  databaseConfigured: z.boolean(),
  embedding: z.strictObject({ provider: z.string().max(20), model: z.string().max(120) }),
  generation: z.strictObject({
    provider: z.string().max(20),
    openaiModel: z.string().max(64).nullable(),
    groqModel: z.string().max(64).nullable(),
    ollamaModel: z.string().max(64).nullable(),
    openaiKeyConfigured: z.boolean(),
    groqKeyConfigured: z.boolean(),
  }),
  ollamaBaseUrl: z.string().max(200),
  extractionAssist: z.enum(['disabled', 'ollama', 'fake']),
  loginEnabled: z.literal(false),
});
export type AdminSettings = z.infer<typeof AdminSettingsSchema>;

/* ------------------------------------------------------------------ local AI suggestions */
export const AdminSuggestRequestSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  fields: z.array(z.enum(ADMIN_LIST_FIELDS)).min(1).max(9),
});
export type AdminSuggestRequest = z.infer<typeof AdminSuggestRequestSchema>;

export const AdminSuggestResultSchema = z.strictObject({
  accepted: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
  detail: AdminDraftDetailSchema,
});
export type AdminSuggestResult = z.infer<typeof AdminSuggestResultSchema>;
