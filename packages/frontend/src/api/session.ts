import type { OdinConnectedUser } from 'odin-connect';

import { apiFetch } from './client';

/** Must match `LOGIN_MESSAGE_PREFIX` in packages/api/src/auth/login.ts. */
export const LOGIN_MESSAGE_PREFIX = 'odin-token-reddit-login:v1\n';

export interface AppSession {
  token: string;
  principal: string;
  /** ms epoch */
  expiresAt: number;
}

export function buildLoginMessage(timestamp: string): Uint8Array {
  return new TextEncoder().encode(`${LOGIN_MESSAGE_PREFIX}${timestamp}`);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function sessionStorageKey(principal: string): string {
  return `otr:session:${principal}`;
}

export function loadSession(principal: string, now = Date.now()): AppSession | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(principal));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppSession>;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number' || parsed.principal !== principal) return null;
    // Refuse sessions within a minute of expiry so a request never races the clock.
    if (parsed.expiresAt - 60_000 <= now) return null;
    return parsed as AppSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AppSession): void {
  try {
    localStorage.setItem(sessionStorageKey(session.principal), JSON.stringify(session));
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export function clearSession(principal: string): void {
  try {
    localStorage.removeItem(sessionStorageKey(principal));
  } catch {
    /* ignore */
  }
}

interface LoginResponse {
  token: string;
  principal: string;
  expiresAt: string;
}

/**
 * Exchange the Odin Connect delegation for an app session: sign an app-bound
 * timestamp with the session key and let the backend verify the chain.
 */
export async function loginWithOdin(user: OdinConnectedUser): Promise<AppSession> {
  const identity = user.getIdentity();
  if (identity === null) {
    throw new Error('Odin session has no delegation; reconnect with requires_delegation');
  }
  const timestamp = Date.now().toString();
  const signature = await identity.sign(buildLoginMessage(timestamp));
  const body = {
    delegation: JSON.stringify(identity.getDelegation().toJSON()),
    timestamp,
    signature: bytesToBase64(new Uint8Array(signature)),
  };
  const res = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body });
  const session: AppSession = { token: res.token, principal: res.principal, expiresAt: Date.parse(res.expiresAt) };
  saveSession(session);
  return session;
}
