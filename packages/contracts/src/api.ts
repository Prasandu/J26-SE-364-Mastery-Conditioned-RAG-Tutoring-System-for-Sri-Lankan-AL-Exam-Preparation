import { z } from 'zod';
import { ActionSchema, ActorSchema } from './action';
import { ErrorCodeSchema } from './codes';
import { GuidanceLevelSchema, IdSchema, LocaleSchema, LocKeySchema, ModeSchema } from './common';
import { NotebookDocumentSchema, NotebookStateSchema } from './notebook';
import { FeedbackSchema } from './state';
import { PublicEventSchema, SessionViewSchema } from './view';

/** HTTP API contracts (v1). Python validates requests and responses against the exported JSON Schemas. */

const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const ExperimentSummarySchema = z.strictObject({
  experimentId: IdSchema,
  experimentNumber: z.int().positive(),
  titleKey: LocKeySchema,
  definitionVersion: VersionSchema,
  assessmentVersion: VersionSchema,
  active: z.boolean(),
  modes: z.array(ModeSchema),
  locales: z.array(LocaleSchema),
});

export type ExperimentSummary = z.infer<typeof ExperimentSummarySchema>;

export const ExperimentDetailsSchema = z.strictObject({
  summary: ExperimentSummarySchema,
  /** Canonical, validated definition (public content). */
  definition: z.record(z.string(), z.unknown()),
});

export const PreLabSubmissionSchema = z.strictObject({
  answers: z.record(IdSchema, z.string().max(2000)),
  prediction: z.string().max(2000),
  acknowledgedSafety: z.array(IdSchema).max(20),
});

export const CreateSessionRequestSchema = z.strictObject({
  experimentId: IdSchema,
  experimentVersion: VersionSchema,
  assessmentVersion: VersionSchema,
  mode: ModeSchema,
  guidanceLevel: GuidanceLevelSchema.nullable(),
  locale: LocaleSchema,
  preLab: PreLabSubmissionSchema.nullable(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const SessionResourceSchema = z.strictObject({
  session: SessionViewSchema,
  locale: LocaleSchema,
  createdAt: z.iso.datetime(),
  notebook: NotebookStateSchema,
});
export type SessionResource = z.infer<typeof SessionResourceSchema>;

/** The client never sends elapsed time, state or consequences; the server stamps elapsed time. */
export const SubmittedEnvelopeSchema = z.strictObject({
  action: ActionSchema,
  actor: ActorSchema,
  acknowledgedSafetyWarning: z.boolean(),
});

export const ActionSubmissionSchema = z.strictObject({
  clientActionId: z.uuid(),
  expectedSequence: z.int().nonnegative(),
  envelope: SubmittedEnvelopeSchema,
  /** Dry run for guided confirmation; nothing is recorded. */
  preview: z.boolean(),
});
export type ActionSubmission = z.infer<typeof ActionSubmissionSchema>;

export const ActionResultSchema = z.strictObject({
  event: PublicEventSchema,
  /** Already filtered for the session's disclosure rules. */
  feedback: z.array(FeedbackSchema),
  session: SessionViewSchema,
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const PreviewResultSchema = z.strictObject({
  predictedErrors: z.array(ErrorCodeSchema),
});

export const NotebookSaveRequestSchema = z.strictObject({
  expectedVersion: z.int().nonnegative(),
  document: NotebookDocumentSchema,
});
export type NotebookSaveRequest = z.infer<typeof NotebookSaveRequestSchema>;

export const NotebookSaveResultSchema = z.strictObject({
  version: z.int().positive(),
  updatedAt: z.iso.datetime(),
});

export const ApiErrorCodeSchema = z.enum([
  'invalid_request',
  'request_too_large',
  'not_found',
  'experiment_version_unavailable',
  'stale_sequence',
  'idempotency_key_reused',
  'notebook_version_conflict',
  'report_not_available',
  'preview_not_available',
  'system_action_not_permitted',
  'event_chain_invalid',
  'verifier_unavailable',
  'verifier_timeout',
  'verifier_invalid_response',
  'assistant_unavailable',
  'unsupported_media_type',
  'document_invalid',
  'document_encrypted',
  'document_too_many_pages',
  'document_no_text',
  'extraction_timeout',
  'extraction_failed',
  'multiple_practicals',
  'draft_version_conflict',
  'review_transition_invalid',
  'admin_storage_error',
  'assistant_timeout',
  'assistant_rate_limited',
  'assistant_invalid_response',
  'knowledge_unavailable',
  'auth_not_configured',
  'internal_error',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCodeSchema,
    message: z.string().max(300),
    correlationId: z.string().min(1).max(64),
    retryable: z.boolean(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  environment: z.enum(['development', 'test', 'production']),
  adapters: z.strictObject({
    repository: z.string(),
    llm: z.string(),
    /** Configured generation model (never credentials); null when no real provider is selected. */
    llmModel: z.string().nullable(),
    /** Failover order and circuit status only (no credentials or failure details). */
    llmRouting: z
      .strictObject({
        order: z.array(z.strictObject({ provider: z.string(), model: z.string() })),
        circuit: z.enum(['closed', 'open', 'half_open']),
        fallbackRequestsRemainingToday: z.int().nonnegative(),
      })
      .nullable(),
    embeddings: z.string(),
  }),
  verifier: z.strictObject({ ready: z.boolean(), engineVersion: z.string().nullable() }),
});
