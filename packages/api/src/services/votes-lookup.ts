import type { Direction, PrismaClient, TargetKind } from '@prisma/client';

/** `targetId → direction` for one viewer across many targets. Empty for anonymous viewers. */
export async function myVotesFor(
  prisma: Pick<PrismaClient, 'vote'>,
  viewer: string | null,
  targetKind: TargetKind,
  targetIds: bigint[],
): Promise<Map<bigint, Direction>> {
  const map = new Map<bigint, Direction>();
  if (viewer === null || targetIds.length === 0) return map;
  const rows = await prisma.vote.findMany({
    where: { voter: viewer, targetKind, targetId: { in: targetIds } },
    select: { targetId: true, direction: true },
  });
  for (const r of rows) map.set(r.targetId, r.direction);
  return map;
}
