import { Router } from 'express';
import { z } from 'zod';

import { optionalAuth, requireAuth } from '../auth/require-auth.js';
import { parseCommentSort, parseId, validateCommentBody } from '../lib/validation.js';
import type { CommentsService } from '../services/comments.service.js';

const createBody = z.object({ body: z.unknown(), parentId: z.string().nullable().optional() });
const editBody = z.object({ body: z.unknown() });

export function commentsRouter(comments: CommentsService, sessionSecret: string): Router {
  const router = Router();
  const optional = optionalAuth(sessionSecret);
  const required = requireAuth(sessionSecret);

  router.get('/threads/:id/comments', optional, async (req, res) => {
    const items = await comments.list(parseId(req.params.id), parseCommentSort(req.query.sort), req.principal);
    res.json({ items });
  });

  router.post('/threads/:id/comments', required, async (req, res) => {
    const body = createBody.parse(req.body);
    const parentId = body.parentId === undefined || body.parentId === null ? null : parseId(body.parentId, 'parentId');
    const created = await comments.create(req.principal!, parseId(req.params.id), parentId, validateCommentBody(body.body));
    res.status(201).json(created);
  });

  router.patch('/comments/:id', required, async (req, res) => {
    const body = editBody.parse(req.body);
    res.json(await comments.edit(req.principal!, parseId(req.params.id), validateCommentBody(body.body), req.principal));
  });

  router.delete('/comments/:id', required, async (req, res) => {
    await comments.remove(req.principal!, parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}
