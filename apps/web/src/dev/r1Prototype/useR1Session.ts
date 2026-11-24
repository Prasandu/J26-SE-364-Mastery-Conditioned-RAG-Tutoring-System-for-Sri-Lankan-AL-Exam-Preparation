import type { Action, SessionView } from '@vlab/contracts';
import { useEffect, useRef, useState } from 'react';
import { definition } from '../../engine/content';
import { createLocalEngineAdapter } from '../../engine/localAdapter';
import { buildSceneModel, type SceneModel } from '../../workbench/sceneModel';

/**
 * R1 prototype (chemistry-lab-advanced-sim-r1): drives a REAL deterministic engine session
 * (the same offline adapter the production app uses in `local` mode) so every interaction this
 * prototype demonstrates is genuinely verified by the trusted engine, not mocked or faked. The
 * engine decides every outcome; this hook only exposes the resulting public projection.
 */

export type DispatchPhase = 'idle' | 'pending' | 'confirmed' | 'rejected';

export interface R1Session {
  model: SceneModel | null;
  phase: DispatchPhase;
  /** The accepted/rejected event from the most recent dispatch (for the inspector to read). */
  lastEvent: { accepted: boolean; action: Action } | null;
  dispatch: (action: Action) => Promise<void>;
  pendingApparatus: string[];
  focusedItem: string | null;
  setFocusedItem: (id: string | null) => void;
  toggleApparatus: (id: string) => void;
}

/** Use this specific apparatus trio only — R1 is deliberately scoped to one bench vignette. */
const SAFETY_CHECKLIST = definition.safetyRules
  .filter((r) => r.kind === 'checklist')
  .map((r) => r.id);

export function useR1Session(): R1Session {
  const adapterRef = useRef(createLocalEngineAdapter());
  const [session, setSession] = useState<SessionView | null>(null);
  const [phase, setPhase] = useState<DispatchPhase>('idle');
  const [lastEvent, setLastEvent] = useState<{ accepted: boolean; action: Action } | null>(null);
  const [pendingApparatus, setPendingApparatus] = useState<string[]>([]);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const adapter = adapterRef.current;
      const resource = await adapter.createSession({
        mode: 'manual',
        guidanceLevel: null,
        locale: 'en',
        preLab: { answers: {}, prediction: '', acknowledgedSafety: SAFETY_CHECKLIST },
      });
      if (cancelled) return;
      // Same first-action pattern the production store uses: safety acknowledgement is the
      // session's first recorded event so every later action is dispatchable.
      const result = await adapter.submitAction(resource.session.sessionId, {
        clientActionId: crypto.randomUUID(),
        expectedSequence: resource.session.nextSequence,
        envelope: {
          action: { type: 'confirm_safety', checklistItemIds: SAFETY_CHECKLIST },
          actor: 'student',
          acknowledgedSafetyWarning: false,
        },
      });
      if (!cancelled) setSession(result.session);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dispatch = async (action: Action) => {
    if (!session || phase === 'pending') return;
    setPhase('pending');
    try {
      const result = await adapterRef.current.submitAction(session.sessionId, {
        clientActionId: crypto.randomUUID(),
        expectedSequence: session.nextSequence,
        envelope: { action, actor: 'student', acknowledgedSafetyWarning: true },
      });
      setSession(result.session);
      setLastEvent({ accepted: result.event.accepted, action });
      setPhase(result.event.accepted ? 'confirmed' : 'rejected');
    } catch {
      setPhase('rejected');
    }
  };

  const toggleApparatus = (id: string) =>
    setPendingApparatus((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const model = session
    ? buildSceneModel(session, definition, { pendingApparatus, focusedItem })
    : null;

  return {
    model,
    phase,
    lastEvent,
    dispatch,
    pendingApparatus,
    focusedItem,
    setFocusedItem,
    toggleApparatus,
  };
}
