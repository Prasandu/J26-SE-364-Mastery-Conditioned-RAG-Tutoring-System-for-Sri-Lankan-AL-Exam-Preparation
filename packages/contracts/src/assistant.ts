import { z } from 'zod';
import { LocaleSchema } from './common';

/**
 * Grounded assistant (v1). The client sends only the session, the question and the locale: never
 * state, chunks, source IDs, owner IDs, prompts, provider or model names. The response exposes a
 * safe projection of the evidence (citation metadata only, never chunk text).
 */

export const ASSISTANT_QUESTION_MAX_CHARS = 500;
export const ASSISTANT_MAX_CITATIONS = 4;

export const AssistantAskRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  question: z.string().min(3).max(ASSISTANT_QUESTION_MAX_CHARS),
  locale: LocaleSchema,
});
export type AssistantAskRequest = z.infer<typeof AssistantAskRequestSchema>;

export const AssistantCitationSchema = z.strictObject({
  chunkId: z.string().regex(/^kc_[0-9a-f]{20}$/),
  documentTitle: z.string().min(1).max(200),
  year: z.int().min(1900).max(2100).nullable(),
  pdfPage: z.int().positive(),
  printedPage: z.int().positive(),
  section: z.string().min(1).max(200),
  heading: z.string().min(1).max(200),
});
export type AssistantCitation = z.infer<typeof AssistantCitationSchema>;

export const AssistantRefusalReasonSchema = z.enum([
  'insufficient_evidence',
  'out_of_scope',
  'unsafe_request',
]);
export type AssistantRefusalReason = z.infer<typeof AssistantRefusalReasonSchema>;

export const AssistantAnswerSchema = z.strictObject({
  status: z.enum(['grounded', 'refused']),
  /** Grounded answer (≈180 words at most) or a fixed, localised refusal message. */
  answer: z.string().min(1).max(2000),
  locale: LocaleSchema,
  evidenceSufficient: z.boolean(),
  refusalReason: AssistantRefusalReasonSchema.nullable(),
  /** Validated against the evidence actually retrieved for this request. */
  citations: z.array(AssistantCitationSchema).max(ASSISTANT_MAX_CITATIONS),
  /** Sinhala answers are machine-generated assistance and are always labelled as such. */
  aiAssistanceLabel: z.boolean(),
  knowledgeVersion: z.string().min(1).max(64),
  /** Session head the answer was produced for, and the fingerprint of the safe state used. */
  sequence: z.int().nonnegative(),
  stateFingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  cached: z.boolean(),
});
export type AssistantAnswer = z.infer<typeof AssistantAnswerSchema>;
