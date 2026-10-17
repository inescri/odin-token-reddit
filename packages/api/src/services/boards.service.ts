import type { PrismaClient } from '@prisma/client';

export interface BoardStats {
  tokenId: string;
  threadCount: number;
  lastActivity: string | null;
}

export class BoardsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Thread counts (non-deleted) and latest thread time per token; unknown ids → 0. */
  async stats(tokenIds: string[]): Promise<BoardStats[]> {
    if (tokenIds.length === 0) return [];
    const groups = await this.prisma.thread.groupBy({
      by: ['tokenId'],
      where: { tokenId: { in: tokenIds }, deleted: false },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const byToken = new Map(groups.map((g) => [g.tokenId, g] as const));
    return tokenIds.map((tokenId) => {
      const g = byToken.get(tokenId);
      return { tokenId, threadCount: g?._count._all ?? 0, lastActivity: g?._max.createdAt?.toISOString() ?? null };
    });
  }
}
