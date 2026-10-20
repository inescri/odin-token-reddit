import { PrismaClient } from '@prisma/client';

import { issueSession } from '../../src/auth/session.js';
import { TEST_SECRET } from './app.js';

let client: PrismaClient | null = null;

/**
 * Prisma client bound to TEST_DATABASE_URL (route tests only). Suites that use
 * it are wrapped in `describe.skipIf(!hasDatabase)`, but vitest still runs the
 * describe body to collect tests, so return an inert stub when unset.
 */
export function testPrisma(): PrismaClient {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return {} as PrismaClient;
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url } } });
  }
  return client;
}

/** Empty every table between tests. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.vote.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.board.deleteMany();
  await prisma.postCooldown.deleteMany();
}

/** Bearer header for a principal, bypassing the delegation dance. */
export async function authFor(principal: string): Promise<string> {
  const s = await issueSession(principal, TEST_SECRET);
  return `Bearer ${s.token}`;
}

export const ALICE = 'alice-principal-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaa';
export const BOB = 'bob-principal-bbbbb-bbbbb-bbbbb-bbbbb-bbbbb-bbbbb-bbbbb-bbbbbb';
export const TOKEN = { divisibility: 8, decimals: 3 };
