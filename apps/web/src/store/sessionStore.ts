import {
  emptyNotebook,
  type Action,
  type ErrorCode,
  type Feedback,
  type GuidanceLevel,
  type Locale,
  type Mode,
  type NotebookDocument,
  type Report,
  type SessionView,
} from '@vlab/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  EngineError,
  type CatalogEntry,
  type EngineAdapter,
  type EngineErrorCode,
  type SubmitRequest,
} from '../engine/adapter';

export type View =
  | 'dashboard'
  | 'library'
  | 'overview'
  | 'prelab'
  | 'mode'
  | 'workbench'
  | 'notebook'
  | 'reflection'
  | 'report'
  | 'admin';

/** The practical runs as one continuous full-screen flow: pre-lab, the lab itself, the notebook
 * write-up, post-lab reflection and the final report, in this order. Mode selection sits between
 * pre-lab and the lab but is not one of the numbered flow steps. */
export type FlowView = 'prelab' | 'workbench' | 'notebook' | 'reflection' | 'report';
export const FLOW_VIEWS: readonly FlowView[] = [
  'prelab',
  'workbench',
  'notebook',
  'reflection',
  'report',
];
/** `FLOW_VIEWS.includes`/`.indexOf` need a `FlowView`; this widens the check to any `View`. */
export const isFlowView = (view: View): view is FlowView =>
  (FLOW_VIEWS as readonly View[]).includes(view);

export type LogKind = 'observation' | 'safety' | 'rejected' | 'procedural' | 'guidance';

export interface LogEntry {
  id: string;
  seq: number;
  attempt: number;
  kind: LogKind;
  messageKey: string;
  visibility: Feedback['visibility'];
}

export interface PreLabState {
  answers: Record<string, string>;
  prediction: string;
  acknowledgedSafety: string[];
}

/** Post-lab reflection answers; same storage pattern as pre-lab (local only, never graded). */
export interface PostLabState {
  answers: Record<string, string>;
}

export type PendingConfirmation =
  | { kind: 'predicted_errors'; action: Action; errorCodes: ErrorCode[] }
  | { kind: 'safety'; action: Action; errorCodes: ErrorCode[] }
  | { kind: 'mode_change'; mode: Mode; guidanceLevel: GuidanceLevel | null };

export type DispatchOutcome =
  'accepted' | 'rejected' | 'needs_confirmation' | 'no_session' | 'busy' | 'failed';

export interface ConnectionError {
  code: EngineErrorCode;
  retryable: boolean;
  /** The exact request to resend; the same clientActionId keeps a retry idempotent. */
  retry: { action: Action; actor: 'student' | 'system'; request: SubmitRequest } | null;
}

/**
 * Visual renderer for the laboratory. A presentation preference only: changing it never touches the
 * session, events, notebook or scores.
 */
export type LabView = '2d' | '3d';

/**
 * Open section of the laboratory notebook (V3-2; presentation only — never tied to the chemistry
 * stage). Context/Materials/Predictions/Protocol/Results/Reflection/Summary, in that order.
 */
export type WorkbenchTab =
  'context' | 'materials' | 'predictions' | 'protocol' | 'results' | 'reflection' | 'summary';

export type NotebookStatus = 'pristine' | 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict';

export interface SessionStoreState {
  /** Read-only engine boundary (static content and the adapter kind). */
  readonly engine: EngineAdapter;
  view: View;
  locale: Locale;
  labView: LabView;
  workbenchTab: WorkbenchTab;
  preLab: PreLabState;
  postLab: PostLabState;
  selection: { mode: Mode; guidanceLevel: GuidanceLevel | null };
  /** Public projection returned by the adapter; never full engine state. */
  session: SessionView | null;
  feedback: Feedback[];
  log: LogEntry[];
  automatic: { running: boolean };
  connection: ConnectionError | null;
  notebook: {
    draft: NotebookDocument | null;
    savedVersion: number;
    status: NotebookStatus;
    conflictVersion: number | null;
  };
  report: { status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'; data: Report | null };
  /** Published practicals this client can run (real catalog data only). */
  catalog: { status: 'idle' | 'loading' | 'ready' | 'error'; items: CatalogEntry[] };
  ui: {
    pendingApparatus: string[];
    focusedItem: string | null;
    pending: PendingConfirmation | null;
    busy: boolean;
  };

  navigate(view: View): void;
  setLocale(locale: Locale): void;
  setLabView(labView: LabView): void;
  setWorkbenchTab(tab: WorkbenchTab): void;
  savePreLabAnswer(questionId: string, text: string): void;
  savePostLabAnswer(questionId: string, text: string): void;
  setPrediction(text: string): void;
  toggleSafetyAcknowledgement(ruleId: string): void;
  selectMode(mode: Mode, guidanceLevel: GuidanceLevel | null): void;
  canStart(): boolean;
  createSession(): Promise<boolean>;
  dispatchLabAction(
    action: Action,
    opts?: { confirmed?: boolean; acknowledgeSafety?: boolean; actor?: 'student' | 'system' },
  ): Promise<DispatchOutcome>;
  retryLastAction(): Promise<DispatchOutcome>;
  requestHint(): Promise<DispatchOutcome>;
  restartSession(): Promise<DispatchOutcome>;
  requestModeChange(mode: Mode, guidanceLevel: GuidanceLevel | null): void;
  advanceAutomaticDemo(): Promise<DispatchOutcome | 'complete'>;
  setAutomaticRunning(running: boolean): void;
  pickItem(itemId: string): void;
  confirmPending(): Promise<void>;
  cancelPending(): void;
  editNotebook(update: (doc: NotebookDocument) => NotebookDocument): void;
  saveNotebook(opts?: { overwrite?: boolean }): Promise<void>;
  loadReport(): Promise<void>;
  loadCatalog(): Promise<void>;
}

export interface StoreDeps {
  adapter: EngineAdapter;
  newClientActionId?: () => string;
}

const KIND: Record<Feedback['severity'], LogKind> = {
  observation: 'observation',
  safety: 'safety',
  error: 'rejected',
  warning: 'procedural',
  info: 'guidance',
};

export type SessionStore = StoreApi<SessionStoreState>;

const freshNotebook = (): SessionStoreState['notebook'] => ({
  draft: null,
  savedVersion: 0,
  status: 'pristine',
  conflictVersion: null,
});

export const createSessionStore = (deps: StoreDeps): SessionStore => {
  const { adapter } = deps;
  const newClientActionId = deps.newClientActionId ?? (() => crypto.randomUUID());
  const checklistIds = adapter.definition.safetyRules
    .filter((r) => r.kind === 'checklist')
    .map((r) => r.id);

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  return createStore<SessionStoreState>()((set, get) => {
    const fail = (error: unknown, retry: ConnectionError['retry']) => {
      const e =
        error instanceof EngineError ? error : new EngineError('internal_error', null, false);
      set({
        connection: { code: e.code, retryable: e.retryable, retry: e.retryable ? retry : null },
      });
    };

    const send = async (request: SubmitRequest, action: Action, actor: 'student' | 'system') => {
      const session = get().session;
      if (!session) return null;
      try {
        const result = await adapter.submitAction(session.sessionId, request);
        const entries: LogEntry[] = result.feedback.map((f, i) => ({
          id: `${session.sessionId}:${result.event.seq}:${i}`,
          seq: result.event.seq,
          attempt: result.event.attempt,
          kind: KIND[f.severity],
          messageKey: f.messageKey,
          visibility: f.visibility,
        }));
        // Items the engine has accepted onto the bench no longer need a pending tick.
        const placed =
          result.event.accepted && action.type === 'select_apparatus' ? action.apparatusIds : [];
        set((s) => ({
          session: result.session,
          feedback: result.feedback,
          log: [...s.log, ...entries],
          connection: null,
          report: result.session.status === 'submitted' ? s.report : { status: 'idle', data: null },
          ui:
            placed.length > 0
              ? {
                  ...s.ui,
                  pendingApparatus: s.ui.pendingApparatus.filter((id) => !placed.includes(id)),
                }
              : s.ui,
        }));
        return result;
      } catch (error) {
        fail(error, { action, actor, request });
        return null;
      }
    };

    const requestFor = (
      action: Action,
      actor: 'student' | 'system',
      ack: boolean,
    ): SubmitRequest | null => {
      const session = get().session;
      if (!session) return null;
      return {
        clientActionId: newClientActionId(),
        expectedSequence: session.nextSequence,
        envelope: { action, actor, acknowledgedSafetyWarning: ack },
      };
    };

    const startNewSession = async (
      mode: Mode,
      guidanceLevel: GuidanceLevel | null,
    ): Promise<boolean> => {
      const { preLab, locale } = get();
      try {
        const resource = await adapter.createSession({
          mode,
          guidanceLevel: mode === 'guided' ? (guidanceLevel ?? 'beginner') : null,
          locale,
          preLab: mode === 'automatic' ? null : preLab,
        });
        set({
          session: resource.session,
          feedback: [],
          log: [],
          automatic: { running: false },
          connection: null,
          notebook: {
            ...freshNotebook(),
            savedVersion: resource.notebook.version,
            draft: resource.notebook.document,
          },
          report: { status: 'idle', data: null },
          ui: { pendingApparatus: [], focusedItem: null, pending: null, busy: false },
          selection: { mode, guidanceLevel: resource.session.guidanceLevel },
          view: 'workbench',
        });
      } catch (error) {
        fail(error, null);
        return false;
      }
      // The pre-lab safety acknowledgement becomes the learner's first recorded action.
      if (mode !== 'automatic') {
        const action: Action = {
          type: 'confirm_safety',
          checklistItemIds: get().preLab.acknowledgedSafety,
        };
        const request = requestFor(action, 'student', false);
        if (request) await send(request, action, 'student');
      }
      return true;
    };

    return {
      engine: adapter,
      view: 'dashboard',
      locale: 'en',
      labView: '2d',
      workbenchTab: 'protocol',
      preLab: { answers: {}, prediction: '', acknowledgedSafety: [] },
      postLab: { answers: {} },
      selection: { mode: 'guided', guidanceLevel: 'beginner' },
      session: null,
      feedback: [],
      log: [],
      automatic: { running: false },
      connection: null,
      notebook: freshNotebook(),
      report: { status: 'idle', data: null },
      catalog: { status: 'idle', items: [] },
      ui: { pendingApparatus: [], focusedItem: null, pending: null, busy: false },

      navigate: (view) => {
        set({ view });
        if (view === 'report') void get().loadReport();
      },
      setLocale: (locale) => set({ locale }),
      setLabView: (labView) => set({ labView }),
      setWorkbenchTab: (workbenchTab) => set({ workbenchTab }),
      savePreLabAnswer: (questionId, text) =>
        set((s) => ({
          preLab: { ...s.preLab, answers: { ...s.preLab.answers, [questionId]: text } },
        })),
      savePostLabAnswer: (questionId, text) =>
        set((s) => ({
          postLab: { answers: { ...s.postLab.answers, [questionId]: text } },
        })),
      setPrediction: (text) => set((s) => ({ preLab: { ...s.preLab, prediction: text } })),
      toggleSafetyAcknowledgement: (ruleId) =>
        set((s) => {
          const has = s.preLab.acknowledgedSafety.includes(ruleId);
          const acknowledgedSafety = has
            ? s.preLab.acknowledgedSafety.filter((id) => id !== ruleId)
            : [...s.preLab.acknowledgedSafety, ruleId];
          return { preLab: { ...s.preLab, acknowledgedSafety } };
        }),
      selectMode: (mode, guidanceLevel) =>
        set({
          selection: {
            mode,
            guidanceLevel: mode === 'guided' ? (guidanceLevel ?? 'beginner') : null,
          },
        }),
      canStart: () => {
        const { selection, preLab } = get();
        return (
          selection.mode === 'automatic' ||
          checklistIds.every((id) => preLab.acknowledgedSafety.includes(id))
        );
      },
      createSession: () =>
        serial(async () => {
          if (!get().canStart()) return false;
          const { mode, guidanceLevel } = get().selection;
          return startNewSession(mode, guidanceLevel);
        }),

      dispatchLabAction: async (action, opts = {}) => {
        // A pending request blocks further submissions (no double-clicks, no reordering).
        if (get().ui.busy) return 'busy';
        set((s) => ({ ui: { ...s.ui, busy: true } }));
        try {
          return await serial(async (): Promise<DispatchOutcome> => {
            const session = get().session;
            if (!session) return 'no_session';
            const actor = opts.actor ?? 'student';
            if (actor === 'student' && session.guidance.confirmPredictedErrors && !opts.confirmed) {
              const probe = requestFor(action, actor, true);
              if (!probe) return 'no_session';
              try {
                const predicted = await adapter.previewAction(session.sessionId, probe);
                if (predicted.length > 0) {
                  set((s) => ({
                    ui: {
                      ...s.ui,
                      pending: { kind: 'predicted_errors', action, errorCodes: predicted },
                    },
                  }));
                  return 'needs_confirmation';
                }
              } catch (error) {
                fail(error, null);
                return 'failed';
              }
            }
            const request = requestFor(action, actor, opts.acknowledgeSafety ?? false);
            if (!request) return 'no_session';
            const result = await send(request, action, actor);
            if (!result) return 'failed';
            if (result.event.rejectionCode === 'safety_acknowledgement_required') {
              let codes: ErrorCode[] = [];
              const probe = requestFor(action, actor, true);
              if (probe)
                codes = await adapter
                  .previewAction(result.session.sessionId, probe)
                  .catch(() => []);
              set((s) => ({
                ui: { ...s.ui, pending: { kind: 'safety', action, errorCodes: codes } },
              }));
              return 'needs_confirmation';
            }
            return result.event.accepted ? 'accepted' : 'rejected';
          });
        } finally {
          set((s) => ({ ui: { ...s.ui, busy: false } }));
        }
      },

      retryLastAction: async () => {
        const retry = get().connection?.retry;
        if (!retry || get().ui.busy) return 'no_session';
        set((s) => ({ ui: { ...s.ui, busy: true } }));
        try {
          return await serial(async () => {
            const result = await send(retry.request, retry.action, retry.actor);
            return result ? (result.event.accepted ? 'accepted' : 'rejected') : 'failed';
          });
        } finally {
          set((s) => ({ ui: { ...s.ui, busy: false } }));
        }
      },

      requestHint: () => get().dispatchLabAction({ type: 'request_hint' }),
      restartSession: () => get().dispatchLabAction({ type: 'restart_experiment' }),

      requestModeChange: (mode, guidanceLevel) =>
        set((s) => ({ ui: { ...s.ui, pending: { kind: 'mode_change', mode, guidanceLevel } } })),

      advanceAutomaticDemo: async () => {
        const session = get().session;
        if (!session || session.mode !== 'automatic') return 'no_session';
        const next = session.guidance.nextAction;
        if (!next) {
          set({ automatic: { running: false } });
          return 'complete';
        }
        const outcome = await get().dispatchLabAction(next, { actor: 'system' });
        if (outcome !== 'accepted' || !get().session?.guidance.nextAction)
          set({ automatic: { running: false } });
        return outcome;
      },
      setAutomaticRunning: (running) => set({ automatic: { running } }),

      pickItem: (itemId) =>
        set((s) => {
          const isApparatus = adapter.definition.apparatus.some((a) => a.id === itemId);
          const pendingApparatus = !isApparatus
            ? s.ui.pendingApparatus
            : s.ui.pendingApparatus.includes(itemId)
              ? s.ui.pendingApparatus.filter((id) => id !== itemId)
              : [...s.ui.pendingApparatus, itemId];
          return { ui: { ...s.ui, pendingApparatus, focusedItem: itemId } };
        }),

      confirmPending: async () => {
        const pending = get().ui.pending;
        if (!pending) return;
        set((s) => ({ ui: { ...s.ui, pending: null } }));
        if (pending.kind === 'mode_change') {
          get().selectMode(pending.mode, pending.guidanceLevel);
          if (!get().canStart()) {
            set({ view: 'prelab' });
            return;
          }
          await serial(() => startNewSession(pending.mode, pending.guidanceLevel));
          return;
        }
        await get().dispatchLabAction(pending.action, { confirmed: true, acknowledgeSafety: true });
      },
      cancelPending: () => set((s) => ({ ui: { ...s.ui, pending: null } })),

      editNotebook: (update) =>
        set((s) => {
          const base = s.notebook.draft ?? emptyNotebook(s.session?.startedOn ?? null);
          return { notebook: { ...s.notebook, draft: update(base), status: 'unsaved' } };
        }),

      saveNotebook: async (opts = {}) => {
        const { session, notebook } = get();
        if (!session || !notebook.draft || notebook.status === 'saving') return;
        const snapshot = notebook.draft;
        const expectedVersion =
          opts.overwrite && notebook.conflictVersion !== null
            ? notebook.conflictVersion
            : notebook.savedVersion;
        set((s) => ({ notebook: { ...s.notebook, status: 'saving' } }));
        try {
          const saved = await adapter.saveNotebook(session.sessionId, {
            expectedVersion,
            document: snapshot,
          });
          set((s) => ({
            notebook: {
              ...s.notebook,
              savedVersion: saved.version,
              conflictVersion: null,
              // Edits made while saving stay unsaved: a save response never overwrites newer text.
              status: s.notebook.draft === snapshot ? 'saved' : 'unsaved',
            },
          }));
        } catch (error) {
          if (error instanceof EngineError && error.code === 'notebook_version_conflict') {
            const current = error.details.currentVersion;
            set((s) => ({
              notebook: {
                ...s.notebook,
                status: 'conflict',
                conflictVersion: typeof current === 'number' ? current : null,
              },
            }));
          } else {
            set((s) => ({ notebook: { ...s.notebook, status: 'error' } }));
            fail(error, null);
          }
        }
      },

      loadReport: async () => {
        const session = get().session;
        if (!session || session.status !== 'submitted') {
          set({ report: { status: 'unavailable', data: null } });
          return;
        }
        set((s) => ({ report: { ...s.report, status: 'loading' } }));
        try {
          const data = await adapter.getReport(session.sessionId);
          set({ report: { status: 'ready', data } });
        } catch (error) {
          const unavailable = error instanceof EngineError && error.code === 'report_not_available';
          set({ report: { status: unavailable ? 'unavailable' : 'error', data: null } });
          if (!unavailable) fail(error, null);
        }
      },

      loadCatalog: async () => {
        if (get().catalog.status === 'loading') return;
        set((s) => ({ catalog: { ...s.catalog, status: 'loading' } }));
        try {
          const items = await adapter.listExperiments();
          set({ catalog: { status: 'ready', items } });
        } catch {
          set({ catalog: { status: 'error', items: [] } });
        }
      },
    };
  });
};
