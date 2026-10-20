import { DelegationChain, DelegationIdentity, Ed25519KeyIdentity } from '@dfinity/identity';
import { Principal } from '@dfinity/principal';
import { createMemoryReplayGuard } from 'odin-auth-verify';
import { describe, expect, it } from 'vitest';

import { LOGIN_SKEW_MS, verifyLogin } from '../src/auth/login.js';
import type { AppError } from '../src/lib/errors.js';
import { OTHER_CANISTER_ID, TEST_CANISTER_ID, makeUser, signLogin } from './helpers/odin-identity.js';
import type { TestUser } from './helpers/odin-identity.js';

const opts = () => ({ appCanisterId: TEST_CANISTER_ID, replayGuard: createMemoryReplayGuard() });
const codeOf = async (p: Promise<unknown>) => { try { await p; return 'none'; } catch (e) { return `${(e as AppError).code}:${(e as Error).message}`; } };

describe('verifyLogin', () => {
  it('accepts a valid delegation login and returns the root principal', async () => {
    const user = await makeUser();
    const body = await signLogin(user);
    await expect(verifyLogin(body, opts())).resolves.toMatchObject({ principal: user.principal });
  });

  it('rejects a delegation scoped to another app', async () => {
    const user = await makeUser({ targets: [OTHER_CANISTER_ID] });
    expect(await codeOf(verifyLogin(await signLogin(user), opts()))).toMatch(/^LOGIN_REJECTED:.*scoped/);
  });

  it('rejects a hop scoped here appended to a delegation scoped to another app', async () => {
    // Another Odin app holds the user's session key and extends the chain.
    const user = await makeUser({ targets: [OTHER_CANISTER_ID] });
    const appended = Ed25519KeyIdentity.generate();
    const chain = await DelegationChain.create(user.session, appended.getPublicKey(), new Date(Date.now() + 60_000), {
      targets: [Principal.fromText(TEST_CANISTER_ID)],
      previous: user.chain,
    });
    const forged: TestUser = {
      ...user,
      session: appended,
      chain,
      identity: DelegationIdentity.fromDelegation(appended, chain),
      delegationJson: JSON.stringify(chain.toJSON()),
    };
    expect(await codeOf(verifyLogin(await signLogin(forged), opts()))).toMatch(/^LOGIN_REJECTED:.*scoped/);
  });

  it('accepts a login once, including in another base64 spelling', async () => {
    const user = await makeUser();
    const body = await signLogin(user);
    const reencoded = { ...body, signature: body.signature.replace(/=+$/, '') };
    expect(reencoded.signature).not.toBe(body.signature);
    const guarded = opts();
    await verifyLogin(body, guarded);
    expect(await codeOf(verifyLogin(body, guarded))).toMatch(/^REPLAY:/);
    expect(await codeOf(verifyLogin(reencoded, guarded))).toMatch(/^REPLAY:/);
  });

  it('rejects a stale timestamp', async () => {
    const user = await makeUser();
    const old = (Date.now() - LOGIN_SKEW_MS - 1000).toString();
    expect(await codeOf(verifyLogin(await signLogin(user, old), opts()))).toMatch(/^LOGIN_REJECTED:.*window/);
  });

  it('rejects a signature over a different timestamp (tampering)', async () => {
    const user = await makeUser();
    const body = await signLogin(user);
    body.timestamp = (Number(body.timestamp) + 1).toString();
    expect(await codeOf(verifyLogin(body, opts()))).toMatch(/^LOGIN_REJECTED:.*signature/);
  });

  it('rejects a signature made by a different session key', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const body = await signLogin(b);
    body.delegation = a.delegationJson;
    expect(await codeOf(verifyLogin(body, opts()))).toMatch(/^LOGIN_REJECTED/);
  });

  it('rejects an expired delegation', async () => {
    const user = await makeUser({ expiresInMs: -1000 });
    expect(await codeOf(verifyLogin(await signLogin(user), opts()))).toMatch(/^LOGIN_REJECTED:.*expired/);
  });

  it('rejects garbage', async () => {
    expect(await codeOf(verifyLogin({ delegation: '{}', timestamp: Date.now().toString(), signature: 'AA==' }, opts()))).toMatch(/^LOGIN_REJECTED/);
    expect(await codeOf(verifyLogin({ delegation: 'nope', timestamp: 'abc', signature: 'AA==' }, opts()))).toMatch(/^LOGIN_REJECTED/);
  });
});
