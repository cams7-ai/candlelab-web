import { useCallback, useEffect, useState } from "react";
export function useQuery<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
) {
  const [state, set] = useState<{ data?: T; error?: Error; loading: boolean }>({
    loading: true,
  });
  const [revision, retryState] = useState(0);
  const retry = useCallback(() => retryState((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    set({ loading: true });
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) set({ data, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted) set({ error, loading: false });
      });
    return () => controller.abort();
  }, [...deps, revision]); // dependencies are explicit at each call site
  return { ...state, retry };
}
