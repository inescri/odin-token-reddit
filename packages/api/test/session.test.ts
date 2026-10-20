import { describe, expect, it } from 'vitest';

import { SESSION_TTL_SECONDS, issueSession, verifySession } from '../src/auth/session.js';

const secret = 'test-secret-test-secret-test-secret-123456';

describe('session', () => {
  it('issues and verifies', async () => {
    const s = await issueSession('aaaaa-aa', secret);
    expect(await verifySession(s.token, secret)).toBe('aaaaa-aa');
    expect(s.expiresAt.getTime() - Date.now()).toBeGreaterThan((SESSION_TTL_SECONDS - 5) * 1000);
  });
  it('rejects wrong secret, tampering, and expiry', async () => {
    const s = await issueSession('aaaaa-aa', secret);
    expect(await verifySession(s.token, 'another-secret-another-secret-another-1234')).toBeNull();
    expect(await verifySession(s.token.slice(0, -2) + 'xx', secret)).toBeNull();
    const old = await issueSession('aaaaa-aa', secret, new Date(Date.now() - (SESSION_TTL_SECONDS + 60) * 1000));
    expect(await verifySession(old.token, secret)).toBeNull();
  });
});
