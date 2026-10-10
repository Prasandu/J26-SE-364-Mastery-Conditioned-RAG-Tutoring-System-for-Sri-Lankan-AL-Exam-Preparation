import {
  ActionResultSchema,
  ApiErrorSchema,
  AssistantAnswerSchema,
  NotebookSaveResultSchema,
  PreviewResultSchema,
  ReportSchema,
  SessionResourceSchema,
  type AssistantAskRequest,
  type CreateSessionRequest,
} from '@vlab/contracts';
import { EngineError, type EngineAdapter } from './adapter';
import { assessment, definition } from './content';

/**
 * API adapter: every state change goes to the FastAPI server, which replays the stored event chain
 * through the verifier. The store is updated only from accepted server responses. There is no
 * silent fallback to the local engine.
 */
export interface ApiAdapterDeps {
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Structural type for a contract schema, so the web app does not import Zod directly. */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export const createApiEngineAdapter = ({
  baseUrl,
  fetch: fetchImpl,
}: ApiAdapterDeps): EngineAdapter => {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const root = baseUrl.replace(/\/+$/, '');

  const request = async <T>(
    method: string,
    path: string,
    schema: Parser<T>,
    body?: unknown,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await doFetch(`${root}${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new EngineError('network_unavailable', null, true);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new EngineError('invalid_response', response.status, response.status >= 500);
    }
    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(json);
      if (!parsed.success)
        throw new EngineError('invalid_response', response.status, response.status >= 500);
      const e = parsed.data.error;
      throw new EngineError(e.code, response.status, e.retryable, e.details ?? {}, e.correlationId);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new EngineError('invalid_response', response.status, false);
    return parsed.data;
  };

  return {
    kind: 'api',
    definition,
    assessment,

    createSession: (req) => {
      const body: CreateSessionRequest = {
        experimentId: definition.experimentId,
        experimentVersion: definition.definitionVersion,
        assessmentVersion: assessment.version,
        mode: req.mode,
        guidanceLevel: req.mode === 'guided' ? req.guidanceLevel : null,
        locale: req.locale,
        preLab: req.preLab,
      };
      return request('POST', '/sessions', SessionResourceSchema, body);
    },
    submitAction: (sessionId, req) =>
      request('POST', `/sessions/${encodeURIComponent(sessionId)}/actions`, ActionResultSchema, {
        ...req,
        preview: false,
      }),
    previewAction: async (sessionId, req) =>
      (
        await request(
          'POST',
          `/sessions/${encodeURIComponent(sessionId)}/actions`,
          PreviewResultSchema,
          { ...req, preview: true },
        )
      ).predictedErrors,
    saveNotebook: (sessionId, req) =>
      request(
        'PUT',
        `/sessions/${encodeURIComponent(sessionId)}/notebook`,
        NotebookSaveResultSchema,
        req,
      ),
    getReport: (sessionId) =>
      request('GET', `/sessions/${encodeURIComponent(sessionId)}/report`, ReportSchema),
    askAssistant: ({ sessionId, question, locale }) => {
      const body: AssistantAskRequest = { sessionId, question, locale };
      return request('POST', '/assistant/ask', AssistantAnswerSchema, body);
    },
  };
};
