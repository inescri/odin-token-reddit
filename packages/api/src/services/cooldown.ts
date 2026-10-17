import type { Prisma } from '@prisma/client';

import { AppError } from '../lib/errors.js';
import { cooldownRemainingSeconds } from '../lib/validation.js';

/**
 * Enforce the per-principal post cooldown inside the caller's transaction and
 * record the new post time. Throws `COOLDOWN` with the seconds remaining.
 */
export async function enforcePostCooldown(
  tx: Prisma.TransactionClient,
  principal: string,
  now: Date,
  cooldownMs?: number,
): Promise<void> {
  const row = await tx.postCooldown.findUnique({ where: { principal } });
  const remaining = cooldownRemainingSeconds(row?.lastPostAt ?? null, now, cooldownMs);
  if (remaining > 0) {
    throw new AppError('COOLDOWN', `please wait ${remaining}s before posting again`);
  }
  await tx.postCooldown.upsert({
    where: { principal },
    create: { principal, lastPostAt: now },
    update: { lastPostAt: now },
  });
}
