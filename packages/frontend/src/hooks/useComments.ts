import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { toCommentView } from '../api/types';
import type { CommentSort, CommentView, WireComment } from '../api/types';
import { useAuthedFetch } from './useAuthedFetch';
import { useSession } from './useSession';

export interface CommentsState {
  items: CommentView[];
  loading: boolean;
  error: string | null;
  replace: (c: CommentView) => void;
  create: (body: string, parentId: string | null) => Promise<CommentView>;
  edit: (id: string, body: string) => Promise<CommentView>;
  remove: (id: string) => Promise<void>;
}

export function useComments(threadId: string | undefined, sort: CommentSort): CommentsState {
  const fetchApi = useAuthedFetch();
  const { status: sessionStatus } = useSession();
  const [items, setItems] = useState<CommentView[]>([]);
  const [loading, setLoading] = useState(Boolean(threadId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    fetchApi<{ items: WireComment[] }>(`/threads/${encodeURIComponent(threadId)}/comments?sort=${sort}`, { signal: ctl.signal })
      .then((res) => {
        setItems(res.items.map(toCommentView));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof ApiError ? e.message : 'failed to load comments');
        setLoading(false);
      });
    return () => ctl.abort();
  }, [threadId, sort, sessionStatus, fetchApi]);

  const replace = useCallback((c: CommentView) => {
    setItems((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  }, []);

  const create = useCallback(
    async (body: string, parentId: string | null) => {
      const w = await fetchApi<WireComment>(`/threads/${encodeURIComponent(threadId ?? '')}/comments`, { method: 'POST', body: { body, parentId } });
      const v = toCommentView(w);
      setItems((prev) => [...prev, v]);
      return v;
    },
    [fetchApi, threadId],
  );

  const edit = useCallback(
    async (id: string, body: string) => {
      const w = await fetchApi<WireComment>(`/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: { body } });
      const v = toCommentView(w);
      replace(v);
      return v;
    },
    [fetchApi, replace],
  );

  const remove = useCallback(
    async (id: string) => {
      await fetchApi<void>(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, deleted: true, body: '' } : c)));
    },
    [fetchApi],
  );

  return { items, loading, error, replace, create, edit, remove };
}
