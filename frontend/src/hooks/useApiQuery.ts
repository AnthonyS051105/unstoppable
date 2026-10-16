"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, NETWORK_MESSAGE } from "@/lib/api-client";

// Minimal loading / empty / error / data state for one request (frontend/CLAUDE.md §5.1).
// No caching library on purpose (stack is final); each screen fetches what it shows.

export type QueryState<T> = {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  /** True when loaded successfully but there is nothing to show. */
  empty: boolean;
  reload: () => void;
};

export function useApiQuery<T>(
  fetcher: (() => Promise<T>) | null,
  deps: React.DependencyList,
  isEmpty: (data: T) => boolean = (d) => Array.isArray(d) && d.length === 0,
): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!fetcher);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const run = fetcherRef.current;
    if (!run) return;
    let alive = true;
    setLoading(true);
    setError(null);
    run()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError("NETWORK", NETWORK_MESSAGE, 0)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const empty = !loading && !error && data !== undefined && isEmpty(data);
  return { data, error, loading, empty, reload };
}
