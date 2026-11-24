import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/client";

interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Run the call again without waiting for `deps` to change, e.g. after an action
   * elsewhere on the page has changed what the call would return. */
  reload: () => void;
}

/**
 * Runs one GET call and keeps its loading and error state.
 *
 * `deps` says when to call again, like useEffect. The call is aborted if the
 * component disappears first, so a slow reply never sets state on a dead screen.
 */
export function useApi<T>(call: (signal: AbortSignal) => Promise<T>, deps: unknown[]): ApiState<T> {
  const [state, setState] = useState<Omit<ApiState<T>, "reload">>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });

    call(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof ApiError ? error.message : String(error);
        setState({ data: null, error: message, loading: false });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}
