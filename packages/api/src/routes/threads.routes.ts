import { Router } from 'express';
import { z } from 'zod';

import { optionalAuth, requireAuth } from '../auth/require-auth.js';
import {
  clampLimit, parseId, parsePage, parseThreadSort, validateThreadBody, validateTitle, validateTokenId,
} from '../lib/validation.js';
import type { ThreadsService } from '../services/threads.service.js';

const tokenMeta = z.object({
  divisibility: z.number().int().min(0).max(18),
  decimals: z.number().int().min(0).max(18),
});

const createBody = z.object({ title: z.unknown(), body: z.unknown().optional(), token: tokenMeta });
const editBody = z.object({ title: z.unknown(), body: z.unknown().optional() });

export function threadsRouter(threads: ThreadsService, sessionSecret: string): Router {
  const router = Router();
  const optional = optionalAuth(sessionSecret);
  const required = requireAuth(sessionSecret);

  router.get('/boards/:tokenId/threads', optional, async (req, res) => {
    const tokenId = validateTokenId(req.params.tokenId);
    const sort = parseThreadSort(req.query.sort);
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    res.json(await threads.list(tokenId, sort, page, limit, req.principal));
  });

  router.post('/boards/:tokenId/threads', required, async (req, res) => {
    const tokenId = validateTokenId(req.params.tokenId);
    const body = createBody.parse(req.body);
    const created = await threads.create(req.principal!, tokenId, validateTitle(body.title), validateThreadBody(body.body), body.token);
    res.status(201).json(created);
  });

  router.get('/threads/:id', optional, async (req, res) => {
    res.json(await threads.get(parseId(req.params.id), req.principal));
  });

  router.patch('/threads/:id', required, async (req, res) => {
    const body = editBody.parse(req.body);
    res.json(await threads.edit(req.principal!, parseId(req.params.id), validateTitle(body.title), validateThreadBody(body.body), req.principal));
  });

  router.delete('/threads/:id', required, async (req, res) => {
    await threads.remove(req.principal!, parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}
