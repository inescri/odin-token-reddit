import type { RequestHandler } from 'express';

import { AppError } from '../lib/errors.js';
import { verifySession } from './session.js';

declare global {
  namespace Express {
    interface Request {
      /** Verified principal of the caller, or `null` for anonymous requests. */
      principal: string | null;
    }
  }
}

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}

/** Sets `req.principal` from a valid bearer session, else `null`. Never rejects. */
export function optionalAuth(secret: string): RequestHandler {
  return async (req, _res, next) => {
    const token = bearer(req.header('authorization'));
    req.principal = token ? await verifySession(token, secret) : null;
    next();
  };
}

/** Requires a valid session; `401 UNAUTHORIZED` otherwise. */
export function requireAuth(secret: string): RequestHandler {
  return async (req, _res, next) => {
    const token = bearer(req.header('authorization'));
    const principal = token ? await verifySession(token, secret) : null;
    if (principal === null) {
      next(new AppError('UNAUTHORIZED', 'sign in required'));
      return;
    }
    req.principal = principal;
    next();
  };
}
