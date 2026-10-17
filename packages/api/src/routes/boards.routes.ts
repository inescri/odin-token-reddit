import { Router } from 'express';

import { AppError } from '../lib/errors.js';
import { validateTokenId } from '../lib/validation.js';
import type { BoardsService } from '../services/boards.service.js';

const MAX_IDS = 100;

export function boardsRouter(boards: BoardsService): Router {
  const router = Router();

  router.get('/boards/stats', async (req, res) => {
    const raw = typeof req.query.tokenIds === 'string' ? req.query.tokenIds : '';
    const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
    if (ids.length > MAX_IDS) throw new AppError('INVALID_INPUT', `at most ${MAX_IDS} tokenIds per request`);
    res.json({ items: await boards.stats(ids.map((id) => validateTokenId(id))) });
  });

  return router;
}
