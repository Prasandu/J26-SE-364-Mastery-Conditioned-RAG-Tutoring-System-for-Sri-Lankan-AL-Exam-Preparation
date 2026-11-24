import { useCallback, useEffect, useState } from 'react';
import { EngineError } from '../engine/adapter';

export type LoadState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; code: string };

/**
 * Loads one admin resource and reloads it on demand. The server decides everything; this only
 * tracks loading and error state for the page.
 */
export function useAdminData<T>(load: () => Promise<T>): {
  state: LoadState<T>;
  reload: () => void;
  setData: (data: T) => void;
} {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setState({ status: 'ready', data }),
      (error: unknown) =>
        active &&
        setState({ status: 'error', code: error instanceof EngineError ? error.code : 'generic' }),
    );
    return () => {
      active = false;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((data: T) => setState({ status: 'ready', data }), []);
  return { state, reload, setData };
}

/** Maps an API error to a translation key (known codes get their own message). */
export const errorKey = (error: unknown, known: ReadonlySet<string>): string => {
  const code = error instanceof EngineError ? error.code : '';
  return known.has(code) ? `admin.error.${code}` : 'admin.error.generic';
};
