import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { selectEngineAdapter } from '../engine/select';
import { createSessionStore, type SessionStore, type SessionStoreState } from './sessionStore';

const StoreContext = createContext<SessionStore | null>(null);

export function StoreProvider({ children, store }: { children: ReactNode; store?: SessionStore }) {
  const [value] = useState(() => store ?? createSessionStore({ adapter: selectEngineAdapter() }));
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSession<T>(selector: (s: SessionStoreState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useSession must be used inside <StoreProvider>');
  return useStore(store, selector);
}
