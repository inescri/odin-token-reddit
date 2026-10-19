import { pino } from 'pino';
import type { PrismaClient } from '@prisma/client';

import { createApp } from '../../src/app.js';
import { ReplayGuard } from '../../src/auth/replay-guard.js';
import type { Env } from '../../src/env.js';
import { TEST_CANISTER_ID } from './odin-identity.js';

export const TEST_SECRET = 'test-session-secret-at-least-32-chars-long!!';

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 0,
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://unused',
    SESSION_SECRET: TEST_SECRET,
    APP_CANISTER_ID: TEST_CANISTER_ID,
    CORS_ORIGINS: ['http://localhost:5173'],
    ODIN_ENV: 'dev',
    LOG_LEVEL: 'silent',
    POST_COOLDOWN_MS: 0,
    ...overrides,
  };
}

export function testApp(prisma: PrismaClient, envOverrides: Partial<Env> = {}) {
  return createApp({ env: testEnv(envOverrides), prisma, logger: pino({ level: 'silent' }), replayGuard: new ReplayGuard(), rateLimit: false });
}

/** Route tests that need MySQL skip when no TEST_DATABASE_URL is configured. */
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
