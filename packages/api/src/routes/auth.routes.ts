import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { verifyLogin } from '../auth/login.js';
import type { ReplayGuard } from '../auth/replay-guard.js';
import { requireAuth } from '../auth/require-auth.js';
import { issueSession } from '../auth/session.js';

const loginBody = z.object({
  delegation: z.string().min(1).max(64 * 1024),
  timestamp: z.string().min(1).max(16),
  signature: z.string().min(1).max(4096),
});

export interface AuthRouterDeps {
  sessionSecret: string;
  appCanisterId: string;
  replayGuard: ReplayGuard;
  /** Disable rate limiting in tests. */
  rateLimit?: boolean;
}

export function authRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  const limiter =
    deps.rateLimit === false
      ? undefined
      : rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

  router.post('/auth/login', ...(limiter ? [limiter] : []), async (req, res) => {
    const body = loginBody.parse(req.body);
    const principal = await verifyLogin(body, { appCanisterId: deps.appCanisterId });
    // Only burn the signature once it proved valid, so a forged attempt cannot
    // pre-poison a legitimate signature's hash.
    deps.replayGuard.assertFresh(body.signature);
    const session = await issueSession(principal, deps.sessionSecret);
    res.json({ token: session.token, principal, expiresAt: session.expiresAt.toISOString() });
  });

  router.get('/auth/me', requireAuth(deps.sessionSecret), (req, res) => {
    res.json({ principal: req.principal });
  });

  return router;
}
