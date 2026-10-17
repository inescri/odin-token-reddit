import { DelegationChain, DelegationIdentity, Ed25519KeyIdentity } from '@dfinity/identity';
import { Principal } from '@dfinity/principal';

import { buildLoginMessage } from '../../src/auth/login.js';

export const TEST_CANISTER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
export const OTHER_CANISTER_ID = 'rrkah-fqaaa-aaaaa-aaaaq-cai';

export interface TestUser {
  root: Ed25519KeyIdentity;
  session: Ed25519KeyIdentity;
  chain: DelegationChain;
  identity: DelegationIdentity;
  principal: string;
  delegationJson: string;
}

/** Build a user the way Odin does: root key delegates to a session key, scoped to targets. */
export async function makeUser(opts: { targets?: string[]; expiresInMs?: number } = {}): Promise<TestUser> {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const targets = (opts.targets ?? [TEST_CANISTER_ID]).map((t) => Principal.fromText(t));
  const chain = await DelegationChain.create(
    root,
    session.getPublicKey(),
    new Date(Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000)),
    { targets },
  );
  const identity = DelegationIdentity.fromDelegation(session, chain);
  return {
    root,
    session,
    chain,
    identity,
    principal: root.getPrincipal().toText(),
    delegationJson: JSON.stringify(chain.toJSON()),
  };
}

export async function signLogin(user: TestUser, timestamp = Date.now().toString()) {
  const sig = await user.identity.sign(buildLoginMessage(timestamp));
  return {
    delegation: user.delegationJson,
    timestamp,
    signature: Buffer.from(new Uint8Array(sig)).toString('base64'),
  };
}
