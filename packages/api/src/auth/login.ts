import { DelegationChain } from '@dfinity/identity';
import { Principal } from '@dfinity/principal';
import { OdinUtils } from 'odin-connect';

import { AppError } from '../lib/errors.js';
import { verifyDelegationChain } from './verify-delegation-chain.js';
import { verifySessionKeySignature } from './verify-session-signature.js';

/**
 * Binds the signed timestamp to this app. A signature over a bare timestamp
 * (as Odin's own `POST /auth` accepts) must not double as a login here, and
 * vice versa.
 */
export const LOGIN_MESSAGE_PREFIX = 'odin-token-reddit-login:v1\n';

/** Accept timestamps within ±5 minutes of server time (mirrors odin-api). */
export const LOGIN_SKEW_MS = 5 * 60 * 1000;

export interface LoginInput {
  /** `JSON.stringify(delegationIdentity.getDelegation().toJSON())` */
  delegation: string;
  /** `Date.now().toString()` at signing time. */
  timestamp: string;
  /** base64 of `identity.sign(buildLoginMessage(timestamp))` */
  signature: string;
}

export interface LoginOptions {
  /** The identity-anchor canister. The delegation must be scoped to it. */
  appCanisterId: string;
  now?: () => number;
}

export interface VerifiedLogin {
  principal: string;
  /** Pass to `ReplayGuard.assertFresh` so one signed login is accepted once. */
  replayKey: string;
}

export function buildLoginMessage(timestamp: string): Uint8Array {
  return new TextEncoder().encode(`${LOGIN_MESSAGE_PREFIX}${timestamp}`);
}

function reject(reason: string): never {
  throw new AppError('LOGIN_REJECTED', reason);
}

/**
 * Verify an Odin Connect delegation login and return the user's principal.
 *
 * Mirrors odin-api's `POST /auth` resolution: chain validity (expiry), chain
 * signatures, signing key = last delegation's pubkey, timestamp window, then
 * the session-key signature over the app-bound message. Adds a target check so
 * a delegation issued to another Odin app cannot be replayed here.
 */
export async function verifyLogin(input: LoginInput, opts: LoginOptions): Promise<VerifiedLogin> {
  const now = opts.now ? opts.now() : Date.now();

  if (!/^[0-9]{1,16}$/.test(input.timestamp)) reject('timestamp must be epoch milliseconds');
  const ts = Number(input.timestamp);
  if (Math.abs(now - ts) > LOGIN_SKEW_MS) reject('timestamp outside the accepted window');

  let chain: DelegationChain;
  try {
    chain = DelegationChain.fromJSON(JSON.parse(input.delegation));
  } catch {
    reject('delegation is not a valid delegation chain');
  }
  if (chain.delegations.length === 0) reject('delegation chain is empty');

  if (!OdinUtils.isDelegationValid(input.delegation)) reject('delegation chain has expired');

  const last = chain.delegations[chain.delegations.length - 1]!.delegation;
  // Each hop that sets `targets` narrows the chain (the IC intersects them), so
  // every scoped hop must name this app. Checking only the last hop would let a
  // session key held by another Odin app append a hop scoped here. A chain with
  // no targets at all is unscoped and rejected too.
  const appTarget = Principal.fromText(opts.appCanisterId).toText();
  const scoped = chain.delegations.map((d) => d.delegation.targets).filter((t) => t !== undefined);
  if (scoped.length === 0 || !scoped.every((targets) => targets.some((t) => t.toText() === appTarget))) {
    reject('delegation is not scoped to this app');
  }

  let chainOk = false;
  try {
    chainOk = await verifyDelegationChain(chain);
  } catch {
    chainOk = false;
  }
  if (!chainOk) reject('delegation chain signature verification failed');

  let signature: Uint8Array;
  try {
    signature = new Uint8Array(Buffer.from(input.signature, 'base64'));
  } catch {
    reject('signature is not valid base64');
  }
  if (signature.length === 0) reject('signature is empty');

  let sigOk = false;
  try {
    sigOk = verifySessionKeySignature({
      signingPubKey: last.pubkey,
      signature,
      message: buildLoginMessage(input.timestamp),
    });
  } catch {
    sigOk = false;
  }
  if (!sigOk) reject('invalid signature');

  return {
    principal: Principal.selfAuthenticating(new Uint8Array(chain.publicKey)).toText(),
    // What the signature commits to: one session key signing one timestamp.
    // Not the signature bytes or their base64, which re-encoding (padding,
    // base64url) or ECDSA malleability can change without a new signing.
    replayKey: `${Buffer.from(new Uint8Array(last.pubkey)).toString('hex')}:${input.timestamp}`,
  };
}
