import { useEffect, useState } from 'react';
import type { OdinToken } from 'odin-connect';

import { apiFetch } from '../api/client';
import type { BoardStats } from '../api/types';
import { odin } from '../odin/client';

export const BOARDS_PAGE_SIZE = 24;

export interface BoardCard {
  token: OdinToken;
  threadCount: number;
  lastActivity: Date | null;
}

export interface BoardsState {
  items: BoardCard[];
  total: number;
  loading: boolean;
  error: string | null;
}

/** Tokens from the Odin API (by market cap, optional search) overlaid with board stats. */
export function useBoards(search: string, page: number): BoardsState {
  const [state, setState] = useState<BoardsState>({ items: [], total: 0, loading: true, error: null });
  const [debounced, setDebounced] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    odin.api
      .getTokens({ page, limit: BOARDS_PAGE_SIZE }, { field: 'marketcap', direction: 'desc' }, debounced ? { search: debounced } : {})
      .then(async (res) => {
        const tokens = res.data;
        const ids = tokens.map((t) => t.id);
        let stats = new Map<string, BoardStats>();
        if (ids.length > 0) {
          try {
            const s = await apiFetch<{ items: BoardStats[] }>(`/boards/stats?tokenIds=${encodeURIComponent(ids.join(','))}`);
            stats = new Map(s.items.map((x) => [x.tokenId, x]));
          } catch {
            /* stats are best-effort */
          }
        }
        if (!active) return;
        setState({
          items: tokens.map((token) => ({
            token,
            threadCount: stats.get(token.id)?.threadCount ?? 0,
            lastActivity: stats.get(token.id)?.lastActivity ? new Date(stats.get(token.id)!.lastActivity!) : null,
          })),
          total: res.count,
          loading: false,
          error: null,
        });
      })
      .catch((e: unknown) => active && setState({ items: [], total: 0, loading: false, error: e instanceof Error ? e.message : 'failed to load tokens' }));
    return () => {
      active = false;
    };
  }, [debounced, page]);

  return state;
}
