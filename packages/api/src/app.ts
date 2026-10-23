import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { createMemoryReplayGuard } from 'odin-auth-verify';
import type { ReplayGuard } from 'odin-auth-verify';
import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';

import type { Env } from './env.js';
import { errorHandler } from './lib/errors.js';
import { authRouter } from './routes/auth.routes.js';
import { boardsRouter } from './routes/boards.routes.js';
import { commentsRouter } from './routes/comments.routes.js';
import { votesRouter } from './routes/votes.routes.js';
import { threadsRouter } from './routes/threads.routes.js';
import { CommentsService } from './services/comments.service.js';
import { ThreadsService } from './services/threads.service.js';
import { VotesService } from './services/votes.service.js';
import { BoardsService } from './services/boards.service.js';

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  logger: Logger;
  replayGuard?: ReplayGuard;
  /** Disable login rate limiting (tests). */
  rateLimit?: boolean;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger: deps.logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(
    cors({
      origin: deps.env.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    authRouter({
      sessionSecret: deps.env.SESSION_SECRET,
      appCanisterId: deps.env.APP_CANISTER_ID,
      // In-memory: correct for a single API instance. Back ReplayGuard with
      // MySQL or Redis before running several instances.
      replayGuard: deps.replayGuard ?? createMemoryReplayGuard(),
      rateLimit: deps.rateLimit,
    }),
  );

  const serviceOptions = { cooldownMs: deps.env.POST_COOLDOWN_MS };
  const threads = new ThreadsService(deps.prisma, serviceOptions);
  const comments = new CommentsService(deps.prisma, serviceOptions);
  const votes = new VotesService(deps.prisma, deps.logger);
  const boards = new BoardsService(deps.prisma);
  app.use(threadsRouter(threads, deps.env.SESSION_SECRET));
  app.use(commentsRouter(comments, deps.env.SESSION_SECRET));
  app.use(votesRouter(votes, deps.env.SESSION_SECRET));
  app.use(boardsRouter(boards));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'route not found' } });
  });
  app.use(errorHandler);
  return app;
}
