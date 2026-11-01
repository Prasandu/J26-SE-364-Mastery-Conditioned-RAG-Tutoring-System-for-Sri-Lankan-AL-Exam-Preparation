import { useEffect } from 'react';
import { useSession } from '../store/StoreProvider';
import { useAdmin } from './AdminContext';

/** Load only through the guarded development API; never a public publishing shortcut. */
export function LocalTeachingSync() {
  const { client, available } = useAdmin();
  const set = useSession((s) => s.setAuthoredTeaching);
  useEffect(() => {
    let active = true;
    const reload = async () => {
      if (!available || !client?.simulationModels) {
        set([]);
        return;
      }
      try {
        const records = await client.simulationModels();
        if (active)
          set(
            records
              .filter((r) => r.status === 'local_active' && r.review !== null)
              .map((r) => r.definition),
          );
      } catch {
        if (active) set([]);
      }
    };
    void reload();
    window.addEventListener('focus', reload);
    return () => {
      active = false;
      window.removeEventListener('focus', reload);
    };
  }, [client, available, set]);
  return null;
}
