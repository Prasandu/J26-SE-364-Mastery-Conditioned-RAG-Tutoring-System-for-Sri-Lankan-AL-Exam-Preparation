import { useEffect, useState } from "react";

import { ApiError } from "@/api/client";

interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Runs one GET call and keeps its loading and error state.
 *
 * `deps` says when to call again, like useEffect. The call is aborted if the
 * component disappears first, so a slow reply never sets state on a dead screen.
 */
export function useApi<T>(call: (signal: AbortSignal) => Promise<T>, deps: unknown[]): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: true });

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
  }, deps);

  return state;
}
