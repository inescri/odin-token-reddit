import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { toThreadView } from '../api/types';
import type { ThreadView, WireThread } from '../api/types';
import { useAuthedFetch } from './useAuthedFetch';
import { useSession } from './useSession';

export interface ThreadState {
  thread: ThreadView | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  setThread: (t: ThreadView) => void;
  edit: (title: string, body: string) => Promise<ThreadView>;
  remove: () => Promise<void>;
}

export function useThread(id: string | undefined): ThreadState {
  const fetchApi = useAuthedFetch();
  const { status: sessionStatus } = useSession();
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetchApi<WireThread>(`/threads/${encodeURIComponent(id)}`, { signal: ctl.signal })
      .then((w) => {
        setThread(toThreadView(w));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof ApiError ? e.message : 'failed to load thread');
        setLoading(false);
      });
    return () => ctl.abort();
  }, [id, sessionStatus, fetchApi]);

  const edit = useCallback(
    async (title: string, body: string) => {
      const w = await fetchApi<WireThread>(`/threads/${encodeURIComponent(id ?? '')}`, { method: 'PATCH', body: { title, body } });
      const v = toThreadView(w);
      setThread(v);
      return v;
    },
    [fetchApi, id],
  );

  const remove = useCallback(async () => {
    await fetchApi<void>(`/threads/${encodeURIComponent(id ?? '')}`, { method: 'DELETE' });
    setThread((t) => (t ? { ...t, deleted: true, title: '', body: '' } : t));
  }, [fetchApi, id]);

  return { thread, loading, notFound, error, setThread, edit, remove };
}
