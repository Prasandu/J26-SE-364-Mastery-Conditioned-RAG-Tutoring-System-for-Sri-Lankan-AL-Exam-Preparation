import type { EngineAdapter } from './adapter';
import { createApiEngineAdapter } from './apiAdapter';
import { createLocalEngineAdapter } from './localAdapter';

/**
 * Chooses the adapter once, at start-up, from `VITE_ENGINE_ADAPTER` (`local` default, or `api`).
 * The choice never changes during a session: API failures are reported, never hidden by switching
 * to the local engine.
 */
export const selectEngineAdapter = (env: ImportMetaEnv = import.meta.env): EngineAdapter => {
  if (env.VITE_ENGINE_ADAPTER === 'api') {
    const baseUrl = env.VITE_API_BASE_URL;
    if (!baseUrl) throw new Error('VITE_API_BASE_URL must be set when VITE_ENGINE_ADAPTER=api');
    return createApiEngineAdapter({ baseUrl });
  }
  return createLocalEngineAdapter();
};
