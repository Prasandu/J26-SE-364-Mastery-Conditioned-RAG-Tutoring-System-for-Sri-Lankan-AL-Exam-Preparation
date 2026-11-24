import type { AdminStatus } from '@vlab/contracts';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createAdminClient, type AdminClient } from './adminClient';
import { EngineError, type EngineErrorCode } from '../engine/adapter';

/**
 * Whether the development admin tools are reachable. Visibility is only a convenience: the
 * server decides access for every request (loopback-only; 404 otherwise).
 *
 * The status fetch and its result live here, not in AdminView, so every consumer (the nav link,
 * the admin console itself) shares one in-flight request instead of each firing its own against
 * a backend that may be slow to reach (e.g. a remote database with no connection pooling).
 */
interface AdminState {
  client: AdminClient | null;
  available: boolean;
  status: AdminStatus | null;
  /** 'loading' only until the first check settles; callers that need a tri-state read this. */
  statusState: 'loading' | 'ready' | 'unavailable';
  statusError: EngineErrorCode | null;
  refreshStatus: () => Promise<void>;
}

const AdminContext = createContext<AdminState>({
  client: null,
  available: false,
  status: null,
  statusState: 'unavailable',
  statusError: null,
  refreshStatus: async () => {},
});

export const defaultAdminClient = (env: ImportMetaEnv = import.meta.env): AdminClient | null =>
  env.VITE_ENGINE_ADAPTER === 'api' && env.VITE_API_BASE_URL
    ? createAdminClient({ baseUrl: env.VITE_API_BASE_URL })
    : null;

export function AdminProvider({
  client,
  children,
}: {
  client: AdminClient | null;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [statusError, setStatusError] = useState<EngineErrorCode | null>(null);
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'unavailable'>(
    client ? 'loading' : 'unavailable',
  );

  const refreshStatus = useCallback(async () => {
    if (!client) {
      setStatusState('unavailable');
      return;
    }
    try {
      const s = await client.status();
      setStatus(s);
      setStatusError(null);
      setStatusState('ready');
    } catch (error) {
      setStatusError(error instanceof EngineError ? error.code : 'internal_error');
      setStatusState('unavailable');
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    if (!client) {
      void Promise.resolve().then(() => {
        if (active) setStatusState('unavailable');
      });
      return () => {
        active = false;
      };
    }
    void Promise.resolve().then(() => {
      if (active) setStatusState('loading');
    });
    client.status().then(
      (s) => {
        if (!active) return;
        setStatus(s);
        setStatusError(null);
        setStatusState('ready');
      },
      (error: unknown) => {
        if (!active) return;
        setStatusError(error instanceof EngineError ? error.code : 'internal_error');
        setStatusState('unavailable');
      },
    );
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <AdminContext.Provider
      value={{
        client,
        available: statusState === 'ready',
        status,
        statusState,
        statusError,
        refreshStatus,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = (): AdminState => useContext(AdminContext);
