import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createAdminClient, type AdminClient } from './adminClient';

/**
 * Whether the development admin tools are reachable. Visibility is only a convenience: the
 * server decides access for every request (loopback-only; 404 otherwise).
 */
interface AdminState {
  client: AdminClient | null;
  available: boolean;
}

const AdminContext = createContext<AdminState>({ client: null, available: false });

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
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (!client) return undefined;
    client.status().then(
      () => active && setAvailable(true),
      () => active && setAvailable(false),
    );
    return () => {
      active = false;
    };
  }, [client]);
  return <AdminContext.Provider value={{ client, available }}>{children}</AdminContext.Provider>;
}

export const useAdmin = (): AdminState => useContext(AdminContext);
