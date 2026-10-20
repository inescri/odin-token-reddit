import { SignJWT, jwtVerify } from 'jose';

export const SESSION_ISSUER = 'odin-token-reddit';
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface IssuedSession {
  token: string;
  principal: string;
  expiresAt: Date;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueSession(
  principal: string,
  secret: string,
  now: Date = new Date(),
): Promise<IssuedSession> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + SESSION_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal)
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key(secret));
  return { token, principal, expiresAt: new Date(exp * 1000) };
}

/** Returns the principal for a valid, unexpired session token; `null` otherwise. */
export async function verifySession(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: SESSION_ISSUER,
      algorithms: ['HS256'],
    });
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
