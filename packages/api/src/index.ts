import { pino } from 'pino';

import { createApp } from './app.js';
import { createPrisma } from './db.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const prisma = createPrisma(env.DATABASE_URL);
const app = createApp({ env, prisma, logger });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, corsOrigins: env.CORS_ORIGINS }, 'api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
