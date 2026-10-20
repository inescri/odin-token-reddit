import { API_URL } from '../config';
import type { WireError } from './types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** App session token (not the Odin JWT). */
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * Minimal fetch wrapper for the board backend. Throws `ApiError` for any
 * non-2xx response using the `{ error: { code, message } }` envelope.
 * Returns `undefined` for 204.
 */
export async function apiFetch<T>(path: string, req: ApiRequest = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (req.token) headers.Authorization = `Bearer ${req.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: req.method ?? 'GET',
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: req.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message : 'network error');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = (json as WireError | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}
