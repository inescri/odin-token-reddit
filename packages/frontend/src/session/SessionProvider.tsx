import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError } from '../api/client';
import { clearSession, loadSession, loginWithOdin } from '../api/session';
import type { AppSession } from '../api/session';
import { useOdinConnect } from '../odin/useOdinConnect';

export type SessionStatus = 'none' | 'logging-in' | 'ready' | 'error';

export interface SessionContextValue {
  status: SessionStatus;
  /** App session token for `apiFetch`, or null when signed out. */
  token: string | null;
  principal: string | null;
  error: string | null;
  /** Retry a failed login. */
  retry: () => void;
  /** Drop the current app session (e.g. after a 401) and log in again. */
  invalidate: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Keeps an app session in step with the Odin Connect session: logs in once
 * the user is connected (reusing a stored, unexpired token when present) and
 * clears everything on disconnect.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { status: odinStatus, user, principal } = useOdinConnect();
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('none');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (odinStatus !== 'connected' || user === null || principal === null) {
      setSession(null);
      setStatus('none');
      setError(null);
      inFlight.current = null;
      return;
    }
    const stored = loadSession(principal);
    if (stored) {
      setSession(stored);
      setStatus('ready');
      setError(null);
      return;
    }
    if (inFlight.current === principal) return;
    inFlight.current = principal;
    let active = true;
    setStatus('logging-in');
    setError(null);
    loginWithOdin(user)
      .then((s) => {
        if (!active) return;
        setSession(s);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!active) return;
        setSession(null);
        setStatus('error');
        setError(e instanceof ApiError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : 'login failed');
      })
      .finally(() => {
        if (inFlight.current === principal) inFlight.current = null;
      });
    return () => {
      active = false;
    };
  }, [odinStatus, user, principal, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const invalidate = useCallback(() => {
    if (principal) clearSession(principal);
    setSession(null);
    setAttempt((n) => n + 1);
  }, [principal]);

  const value = useMemo<SessionContextValue>(
    () => ({ status, token: session?.token ?? null, principal: session?.principal ?? null, error, retry, invalidate }),
    [status, session, error, retry, invalidate],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
