import { OdinLoginError, buildOdinLoginMessage, verifyOdinLogin } from 'odin-auth-verify';
import type { ReplayGuard } from 'odin-auth-verify';

import { AppError } from '../lib/errors.js';

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
  /** Records accepted logins so one signed login is accepted once. */
  replayGuard: ReplayGuard;
  now?: () => number;
}

export interface VerifiedLogin {
  principal: string;
}

export function buildLoginMessage(timestamp: string): Uint8Array {
  return buildOdinLoginMessage(LOGIN_MESSAGE_PREFIX, timestamp);
}

/**
 * Verify an Odin Connect delegation login and return the user's principal.
 *
 * `verifyOdinLogin` (odin-auth-verify) checks the timestamp window, chain
 * expiry, that every scoped hop targets this app, the chain signatures, and
 * the session-key signature over the app-bound message, then claims the login
 * in `replayGuard` only once all of that passed.
 */
export async function verifyLogin(input: LoginInput, opts: LoginOptions): Promise<VerifiedLogin> {
  try {
    const { principal } = await verifyOdinLogin(input, {
      appCanisterId: opts.appCanisterId,
      messagePrefix: LOGIN_MESSAGE_PREFIX,
      replayGuard: opts.replayGuard,
      maxSkewMs: LOGIN_SKEW_MS,
      now: opts.now,
    });
    return { principal };
  } catch (err) {
    if (err instanceof OdinLoginError) {
      throw new AppError(err.code === 'REPLAYED' ? 'REPLAY' : 'LOGIN_REJECTED', err.message);
    }
    throw err;
  }
}
