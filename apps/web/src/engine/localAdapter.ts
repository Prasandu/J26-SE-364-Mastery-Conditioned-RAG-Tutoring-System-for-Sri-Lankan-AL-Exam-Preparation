import type {
  ActionResult,
  NotebookDocument,
  SessionResource,
  SimulationState,
} from '@vlab/contracts';
import {
  applyEnvelope,
  createInitialState,
  previewEnvelope,
  projectSession,
  reportFor,
  handbookModels,
  initialHandbookRun,
  transitionHandbook,
  calculateHandbook,
  parseTeachingDefinition,
  initialTeachingRun,
  transitionTeaching,
  projectTeaching,
  type OperationError,
  type SimulationContext,
} from '@vlab/simulation-core';
import { EngineError, type EngineAdapter, type SubmitRequest } from './adapter';
import { bundledCatalogEntry } from './catalog';
import { assessment, definition } from './content';
import teachingDefinitions from '../../../../content/experiments/teaching/handbook21-30.v1.json';

export const teachingPractice = {
  bundled: teachingDefinitions.map(parseTeachingDefinition),
  parse: parseTeachingDefinition,
  create: initialTeachingRun,
  dispatch: transitionTeaching,
  project: projectTeaching,
};
export type {
  TeachingRun,
  TeachingAction,
  TeachingError,
  TeachingTrial,
} from '@vlab/simulation-core';

/** Local-only teaching models use this same engine boundary, separately from API sessions. */
export const handbookPractice = {
  models: handbookModels,
  create: initialHandbookRun,
  dispatch: transitionHandbook,
  preview: calculateHandbook,
};
export type {
  HandbookAction,
  HandbookError,
  HandbookRun,
  HandbookResult,
  HandbookModel,
} from '@vlab/simulation-core';

/**
 * Offline adapter: the engine runs in the browser with the same rules and projections as the
 * server (idempotency, expected sequence, system-action and preview rules, report gating).
 * It cannot keep hidden results secret from a determined user, because the full state lives in
 * this tab; the UI still applies the same disclosure rules.
 */
export interface LocalAdapterDeps {
  now?: () => number;
  newSessionId?: () => string;
  newSeed?: () => number;
  today?: () => string;
  ctx?: SimulationContext;
}

interface LocalSession {
  state: SimulationState;
  createdAt: number;
  createdIso: string;
  locale: SessionResource['locale'];
  byClientId: Map<string, { hash: string; response: ActionResult }>;
  notebook: { version: number; document: NotebookDocument | null; updatedAt: string | null };
}

const isoDate = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
const hashOf = (env: SubmitRequest['envelope']) =>
  JSON.stringify([env.action, env.actor, env.acknowledgedSafetyWarning]);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Same codes the API returns for the same operation failures. */
const operationError = (code: OperationError): EngineError =>
  code === 'not_submitted'
    ? new EngineError('report_not_available', 409, false)
    : new EngineError(code, 400, false);

export const createLocalEngineAdapter = (deps: LocalAdapterDeps = {}): EngineAdapter => {
  const ctx = deps.ctx ?? { definition, assessment };
  const now = deps.now ?? (() => Date.now());
  const newSessionId = deps.newSessionId ?? (() => crypto.randomUUID());
  const newSeed = deps.newSeed ?? randomSeed;
  const today = deps.today ?? isoDate;
  const sessions = new Map<string, LocalSession>();

  const get = (sessionId: string) => {
    const s = sessions.get(sessionId);
    if (!s) throw new EngineError('not_found', 404, false);
    return s;
  };
  const envelopeFor = (s: LocalSession, req: SubmitRequest) => ({
    ...req.envelope,
    elapsedMs: Math.max(s.state.meta.elapsedMs, Math.round(now() - s.createdAt)),
  });
  const checkSequence = (s: LocalSession, expected: number) => {
    if (expected !== s.state.meta.nextSeq)
      throw new EngineError('stale_sequence', 409, false, {
        currentSequence: s.state.meta.nextSeq,
      });
  };

  return {
    kind: 'local',
    definition: ctx.definition,
    assessment: ctx.assessment,

    createSession: async (req) => {
      const sessionId = newSessionId();
      const state = createInitialState(
        {
          sessionId,
          mode: req.mode,
          guidanceLevel: req.mode === 'guided' ? (req.guidanceLevel ?? 'beginner') : null,
          seed: newSeed(),
          startedOn: today(),
        },
        ctx,
      );
      const createdAt = now();
      const session: LocalSession = {
        state,
        createdAt,
        createdIso: new Date(createdAt).toISOString(),
        locale: req.locale,
        byClientId: new Map(),
        notebook: { version: 0, document: null, updatedAt: null },
      };
      sessions.set(sessionId, session);
      return {
        session: projectSession(state, ctx),
        locale: req.locale,
        createdAt: session.createdIso,
        notebook: clone(session.notebook),
      };
    },

    submitAction: async (sessionId, req) => {
      const s = get(sessionId);
      const previous = s.byClientId.get(req.clientActionId);
      if (previous) {
        if (previous.hash !== hashOf(req.envelope))
          throw new EngineError('idempotency_key_reused', 409, false);
        return clone(previous.response);
      }
      checkSequence(s, req.expectedSequence);
      const result = applyEnvelope(s.state, envelopeFor(s, req), ctx);
      if (!result.ok) throw operationError(result.code);
      s.state = result.state;
      const lastEvent = result.view.events.at(-1);
      if (!lastEvent) throw new EngineError('invalid_response', null, false);
      const response: ActionResult = {
        event: lastEvent,
        feedback: result.feedback,
        session: result.view,
      };
      s.byClientId.set(req.clientActionId, {
        hash: hashOf(req.envelope),
        response: clone(response),
      });
      return response;
    },

    previewAction: async (sessionId, req) => {
      const s = get(sessionId);
      checkSequence(s, req.expectedSequence);
      const result = previewEnvelope(s.state, envelopeFor(s, req), ctx);
      if (!result.ok) throw operationError(result.code);
      return result.predictedErrors;
    },

    saveNotebook: async (sessionId, req) => {
      const s = get(sessionId);
      if (req.expectedVersion !== s.notebook.version)
        throw new EngineError('notebook_version_conflict', 409, false, {
          currentVersion: s.notebook.version,
        });
      const updatedAt = new Date(now()).toISOString();
      s.notebook = { version: s.notebook.version + 1, document: clone(req.document), updatedAt };
      return { version: s.notebook.version, updatedAt };
    },

    getReport: async (sessionId) => {
      const result = reportFor(get(sessionId).state, ctx);
      if (!result.ok) throw new EngineError('report_not_available', 409, false);
      return result.report;
    },

    listExperiments: async () => [bundledCatalogEntry(ctx.definition)],

    // The grounded assistant needs the server's private knowledge base; offline it is unavailable.
    askAssistant: async () => {
      throw new EngineError('assistant_unavailable', null, false);
    },
  };
};
