import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/require-auth.js';
import { parseWeight } from '../lib/amounts.js';
import { AppError } from '../lib/errors.js';
import { parseId } from '../lib/validation.js';
import type { VotesService } from '../services/votes.service.js';

const voteBody = z.object({
  target: z.object({ kind: z.enum(['thread', 'comment']), id: z.string() }),
  direction: z.enum(['up', 'down']),
  weight: z.unknown(),
});

export function votesRouter(votes: VotesService, sessionSecret: string): Router {
  const router = Router();

  router.post('/votes', requireAuth(sessionSecret), async (req, res) => {
    const body = voteBody.parse(req.body);
    const weight = parseWeight(body.weight);
    if (weight === null) throw new AppError('INVALID_INPUT', 'weight must be a non-negative integer string of at most 40 digits');
    const outcome = await votes.vote(
      req.principal!,
      { kind: body.target.kind, id: parseId(body.target.id, 'target.id') },
      body.direction,
      weight,
    );
    res.json(outcome);
  });

  return router;
}
