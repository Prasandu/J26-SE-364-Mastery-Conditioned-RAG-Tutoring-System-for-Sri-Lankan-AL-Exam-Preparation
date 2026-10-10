import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import type { EngineAdapter } from '../engine/adapter';
import { createLocalEngineAdapter } from '../engine/localAdapter';
import { createSessionStore, type SessionStore } from '../store/sessionStore';

export const TODAY = '2026-10-10';

/** Deterministic offline adapter: fixed seed, session IDs, date and a monotonic clock. */
export const makeLocalAdapter = (seed = 42): EngineAdapter => {
  let clock = 0;
  let ids = 0;
  return createLocalEngineAdapter({
    now: () => (clock += 1000),
    newSessionId: () => `test-session-${++ids}`,
    newSeed: () => seed,
    today: () => TODAY,
  });
};

export const makeStore = (
  seed = 42,
  adapter: EngineAdapter = makeLocalAdapter(seed),
): SessionStore => {
  let n = 0;
  return createSessionStore({
    adapter,
    newClientActionId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
};

export const acknowledgeAllSafety = (store: SessionStore) => {
  const { engine, toggleSafetyAcknowledgement } = store.getState();
  for (const r of engine.definition.safetyRules.filter((x) => x.kind === 'checklist'))
    if (!store.getState().preLab.acknowledgedSafety.includes(r.id))
      toggleSafetyAcknowledgement(r.id);
};

export const startSession = async (
  store: SessionStore,
  mode: 'automatic' | 'guided' | 'manual',
  level: 'beginner' | 'intermediate' | 'advanced' | null = null,
) => {
  acknowledgeAllSafety(store);
  store.getState().selectMode(mode, level);
  await store.getState().createSession();
  const session = store.getState().session;
  if (!session) throw new Error('session did not start');
  return session;
};

export const renderApp = (store: SessionStore = makeStore()) => {
  const user = userEvent.setup();
  const utils = render(<App store={store} />);
  return { store, user, ...utils };
};
