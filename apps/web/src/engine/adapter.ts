import type {
  Action,
  ActionResult,
  ApiErrorCode,
  AssistantAnswer,
  AssessmentDefinition,
  ErrorCode,
  ExperimentDefinition,
  GuidanceLevel,
  Locale,
  Mode,
  NotebookSaveRequest,
  Report,
  SessionResource,
} from '@vlab/contracts';

/**
 * The only boundary between the UI and a simulation engine. Two implementations exist:
 * `local` (offline, engine in the browser) and `api` (FastAPI + server-side verifier).
 * Both return the same public projections; the UI never calculates chemistry, mutates lab state
 * or decides correctness itself.
 */
export interface StartSessionRequest {
  mode: Mode;
  guidanceLevel: GuidanceLevel | null;
  locale: Locale;
  preLab: {
    answers: Record<string, string>;
    prediction: string;
    acknowledgedSafety: string[];
  } | null;
}

export interface SubmitRequest {
  clientActionId: string;
  expectedSequence: number;
  envelope: { action: Action; actor: 'student' | 'system'; acknowledgedSafetyWarning: boolean };
}

export type EngineErrorCode = ApiErrorCode | 'network_unavailable' | 'invalid_response';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly details: Record<string, string | number | boolean | null> = {},
    readonly correlationId: string | null = null,
  ) {
    super(code);
    this.name = 'EngineError';
  }
}

export interface EngineAdapter {
  readonly kind: 'local' | 'api';
  readonly definition: ExperimentDefinition;
  readonly assessment: AssessmentDefinition;
  createSession(req: StartSessionRequest): Promise<SessionResource>;
  submitAction(sessionId: string, req: SubmitRequest): Promise<ActionResult>;
  previewAction(sessionId: string, req: SubmitRequest): Promise<ErrorCode[]>;
  saveNotebook(
    sessionId: string,
    req: NotebookSaveRequest,
  ): Promise<{ version: number; updatedAt: string }>;
  getReport(sessionId: string): Promise<Report>;
  /** Grounded assistant: sends only the session, question and locale (never state or sources). */
  askAssistant(req: AssistantRequest): Promise<AssistantAnswer>;
}

export interface AssistantRequest {
  sessionId: string;
  question: string;
  locale: Locale;
}
