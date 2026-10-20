// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { buildLoginMessage, bytesToBase64, loadSession, saveSession, sessionStorageKey } from './session';

describe('session helpers', () => {
  it('builds the app-bound login message', () => {
    expect(new TextDecoder().decode(buildLoginMessage('1700000000000'))).toBe('odin-token-reddit-login:v1\n1700000000000');
  });
  it('base64 encodes bytes', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
  it('stores per principal and refuses near-expired sessions', () => {
    const s = { token: 't', principal: 'p-1', expiresAt: 2_000_000 };
    saveSession(s);
    expect(localStorage.getItem(sessionStorageKey('p-1'))).toContain('"token":"t"');
    expect(loadSession('p-1', 1_000_000)).toEqual(s);
    expect(loadSession('p-1', 1_950_000)).toBeNull();
    expect(loadSession('p-2', 1_000_000)).toBeNull();
  });
});
