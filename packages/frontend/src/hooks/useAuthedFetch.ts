import { useCallback } from 'react';

import { ApiError, apiFetch } from '../api/client';
import type { ApiRequest } from '../api/client';
import { useSession } from './useSession';

/** `apiFetch` bound to the current app session; a 401 drops the session so it re-logs in. */
export function useAuthedFetch() {
  const { token, invalidate } = useSession();
  return useCallback(
    async <T,>(path: string, req: Omit<ApiRequest, 'token'> = {}): Promise<T> => {
      try {
        return await apiFetch<T>(path, { ...req, token });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && token) invalidate();
        throw e;
      }
    },
    [token, invalidate],
  );
}
