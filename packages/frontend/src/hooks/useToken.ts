import { useEffect, useState } from 'react';
import type { OdinToken } from 'odin-connect';

import { odin } from '../odin/client';

const cache = new Map<string, Promise<OdinToken>>();

/** Token metadata via the SDK, cached per page load. */
export function fetchToken(id: string): Promise<OdinToken> {
  let p = cache.get(id);
  if (!p) {
    p = odin.api.getToken(id).catch((e: unknown) => {
      cache.delete(id);
      throw e;
    });
    cache.set(id, p);
  }
  return p;
}

export interface TokenState {
  token: OdinToken | null;
  loading: boolean;
  error: string | null;
}

export function useToken(id: string | undefined): TokenState {
  const [state, setState] = useState<TokenState>({ token: null, loading: Boolean(id), error: null });

  useEffect(() => {
    if (!id) {
      setState({ token: null, loading: false, error: null });
      return;
    }
    let active = true;
    setState({ token: null, loading: true, error: null });
    fetchToken(id)
      .then((token) => active && setState({ token, loading: false, error: null }))
      .catch((e: unknown) => active && setState({ token: null, loading: false, error: e instanceof Error ? e.message : 'failed to load token' }));
    return () => {
      active = false;
    };
  }, [id]);

  return state;
}
