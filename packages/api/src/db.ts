import { PrismaClient } from '@prisma/client';

/** One Prisma client per process. */
export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
