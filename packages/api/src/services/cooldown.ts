import { Prisma } from '@prisma/client';

import { AppError } from '../lib/errors.js';
import { cooldownRemainingSeconds } from '../lib/validation.js';

/**
 * Enforce the per-principal post cooldown inside the caller's transaction and
 * record the new post time. Throws `COOLDOWN` with the seconds remaining.
 *
 * The row is created if missing and locked before it is read, so concurrent
 * posts from one principal serialise and only the first passes. The no-op
 * `ON DUPLICATE KEY UPDATE` takes an exclusive lock up front; a plain
 * `INSERT IGNORE` takes a shared one, which deadlocks with the `FOR UPDATE`.
 */
export async function enforcePostCooldown(
  tx: Prisma.TransactionClient,
  principal: string,
  now: Date,
  cooldownMs?: number,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO \`PostCooldown\` (principal, lastPostAt) VALUES (${principal}, ${new Date(0)})
    ON DUPLICATE KEY UPDATE principal = principal`);
  const rows = await tx.$queryRaw<Array<{ lastPostAt: Date }>>(Prisma.sql`
    SELECT lastPostAt FROM \`PostCooldown\` WHERE principal = ${principal} FOR UPDATE`);
  const remaining = cooldownRemainingSeconds(rows[0]?.lastPostAt ?? null, now, cooldownMs);
  if (remaining > 0) {
    throw new AppError('COOLDOWN', `please wait ${remaining}s before posting again`);
  }
  await tx.postCooldown.update({ where: { principal }, data: { lastPostAt: now } });
}
