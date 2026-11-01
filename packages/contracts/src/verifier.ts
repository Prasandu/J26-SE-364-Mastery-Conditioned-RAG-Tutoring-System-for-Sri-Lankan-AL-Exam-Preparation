import { z } from 'zod';
import { ActionEnvelopeSchema } from './action';
import { ErrorCodeSchema } from './codes';
import { ReportSchema } from './report';
import { DomainEventSchema, FeedbackSchema, SessionInitSchema } from './state';
import { SessionViewSchema } from './view';

/**
 * Protocol between the Python API and the bundled simulation-core verifier CLI (JSON over
 * stdin/stdout). The definition and assessment are the canonical files loaded by the server.
 */
export const VERIFIER_PROTOCOL = 1;

const Expected = z.strictObject({
  engineVersion: z.string(),
  definitionVersion: z.string(),
  assessmentVersion: z.string(),
});

const base = {
  protocol: z.literal(VERIFIER_PROTOCOL),
  expected: Expected,
  definition: z.unknown(),
  assessment: z.unknown(),
  init: SessionInitSchema,
};
const withEvents = { ...base, events: z.array(DomainEventSchema) };

export const VerifierRequestSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('initialize'), ...base }),
  z.strictObject({ op: z.literal('apply'), ...withEvents, envelope: ActionEnvelopeSchema }),
  z.strictObject({ op: z.literal('preview'), ...withEvents, envelope: ActionEnvelopeSchema }),
  z.strictObject({ op: z.literal('view'), ...withEvents }),
  z.strictObject({ op: z.literal('report'), ...withEvents }),
  z.strictObject({ op: z.literal('verify'), ...withEvents }),
]);
export type VerifierRequest = z.infer<typeof VerifierRequestSchema>;

export const VerifierErrorCodeSchema = z.enum([
  'invalid_request',
  'version_mismatch',
  'event_chain_invalid',
  'not_submitted',
  'preview_not_available',
  'system_action_not_permitted',
  'internal',
]);

const ok = {
  protocol: z.literal(VERIFIER_PROTOCOL),
  ok: z.literal(true),
  engineVersion: z.string(),
};
const Head = z.string().min(1);

export const VerifierResponseSchema = z.union([
  z.strictObject({
    ...ok,
    op: z.literal('initialize'),
    result: z.strictObject({ view: SessionViewSchema, headFingerprint: Head }),
  }),
  z.strictObject({
    ...ok,
    op: z.literal('apply'),
    result: z.strictObject({
      event: DomainEventSchema,
      feedback: z.array(FeedbackSchema),
      view: SessionViewSchema,
      headFingerprint: Head,
    }),
  }),
  z.strictObject({
    ...ok,
    op: z.literal('preview'),
    result: z.strictObject({ predictedErrors: z.array(ErrorCodeSchema) }),
  }),
  z.strictObject({
    ...ok,
    op: z.literal('view'),
    result: z.strictObject({ view: SessionViewSchema, headFingerprint: Head }),
  }),
  z.strictObject({
    ...ok,
    op: z.literal('report'),
    result: z.strictObject({ report: ReportSchema, headFingerprint: Head }),
  }),
  z.strictObject({
    ...ok,
    op: z.literal('verify'),
    result: z.strictObject({ headFingerprint: Head, eventCount: z.int().nonnegative() }),
  }),
  z.strictObject({
    protocol: z.literal(VERIFIER_PROTOCOL),
    ok: z.literal(false),
    engineVersion: z.string(),
    error: z.strictObject({
      code: VerifierErrorCodeSchema,
      message: z.string().max(300),
      divergedAtSeq: z.int().nonnegative().nullable(),
    }),
  }),
]);
export type VerifierResponse = z.infer<typeof VerifierResponseSchema>;
