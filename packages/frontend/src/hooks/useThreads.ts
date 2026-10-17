import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { toThreadView } from '../api/types';
import type { ThreadSort, ThreadView, WireThread } from '../api/types';
import { useAuthedFetch } from './useAuthedFetch';
import { useSession } from './useSession';

export interface ThreadsState {
  items: ThreadView[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  replace: (thread: ThreadView) => void;
  create: (input: { title: string; body: string; token: { divisibility: number; decimals: number } }) => Promise<ThreadView>;
}

export function useThreads(tokenId: string | undefined, sort: ThreadSort, page: number, limit = 25): ThreadsState {
  const fetchApi = useAuthedFetch();
  const { status: sessionStatus } = useSession();
  const [items, setItems] = useState<ThreadView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(tokenId));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tokenId) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    fetchApi<{ items: WireThread[]; total: number }>(
      `/boards/${encodeURIComponent(tokenId)}/threads?sort=${sort}&page=${page}&limit=${limit}`,
      { signal: ctl.signal },
    )
      .then((res) => {
        setItems(res.items.map(toThreadView));
        setTotal(res.total);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof ApiError ? e.message : 'failed to load threads');
        setLoading(false);
      });
    return () => ctl.abort();
    // sessionStatus: refetch once logged in so `myVote` populates.
  }, [tokenId, sort, page, limit, tick, sessionStatus, fetchApi]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const replace = useCallback((thread: ThreadView) => {
    setItems((prev) => prev.map((t) => (t.id === thread.id ? thread : t)));
  }, []);
  const create = useCallback<ThreadsState['create']>(
    async (input) => {
      const wire = await fetchApi<WireThread>(`/boards/${encodeURIComponent(tokenId ?? '')}/threads`, { method: 'POST', body: input });
      const view = toThreadView(wire);
      setItems((prev) => [view, ...prev]);
      setTotal((n) => n + 1);
      return view;
    },
    [fetchApi, tokenId],
  );

  return { items, total, loading, error, refresh, replace, create };
}
