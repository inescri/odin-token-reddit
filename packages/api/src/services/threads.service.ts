import type { PrismaClient, Thread } from '@prisma/client';

import { AppError } from '../lib/errors.js';
import { hotThreadIdsSql, listedThreadWhere, threadOrderBy } from '../lib/ranking.js';
import type { ThreadSort } from '../lib/validation.js';
import { enforcePostCooldown } from './cooldown.js';
import type { ServiceOptions } from './options.js';
import { myVotesFor } from './votes-lookup.js';
import { toWireThread } from './wire.js';
import type { WireThread } from './wire.js';

export interface TokenMeta {
  divisibility: number;
  decimals: number;
}

export interface ThreadPage {
  items: WireThread[];
  total: number;
}

export class ThreadsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: ServiceOptions = {},
  ) {}

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  async list(tokenId: string, sort: ThreadSort, page: number, limit: number, viewer: string | null): Promise<ThreadPage> {
    const offset = (page - 1) * limit;
    const where = listedThreadWhere(tokenId);
    const total = await this.prisma.thread.count({ where });

    let threads: Thread[];
    if (sort === 'hot') {
      const ids = (await this.prisma.$queryRaw<{ id: bigint }[]>(hotThreadIdsSql(tokenId, limit, offset))).map((r) => r.id);
      const rows = await this.prisma.thread.findMany({ where: { id: { in: ids } } });
      const byId = new Map(rows.map((r) => [r.id, r] as const));
      threads = ids.map((id) => byId.get(id)).filter((t): t is Thread => t !== undefined);
    } else {
      threads = await this.prisma.thread.findMany({ where, orderBy: threadOrderBy(sort), skip: offset, take: limit });
    }

    const votes = await myVotesFor(this.prisma, viewer, 'THREAD', threads.map((t) => t.id));
    return { items: threads.map((t) => toWireThread(t, votes.get(t.id) ?? null)), total };
  }

  async get(id: bigint, viewer: string | null): Promise<WireThread> {
    const t = await this.prisma.thread.findUnique({ where: { id } });
    if (!t) throw new AppError('NOT_FOUND', 'thread not found');
    const votes = await myVotesFor(this.prisma, viewer, 'THREAD', [id]);
    return toWireThread(t, votes.get(id) ?? null);
  }

  async create(principal: string, tokenId: string, title: string, body: string, token: TokenMeta): Promise<WireThread> {
    const now = this.now();
    const created = await this.prisma.$transaction(async (tx) => {
      await enforcePostCooldown(tx, principal, now, this.opts.cooldownMs);
      await tx.board.upsert({
        where: { tokenId },
        create: { tokenId, divisibility: token.divisibility, decimals: token.decimals },
        // Metadata is display-only; keep the first values unless they were never set.
        update: {},
      });
      return tx.thread.create({ data: { tokenId, author: principal, title, body, createdAt: now } });
    });
    return toWireThread(created, null);
  }

  async edit(principal: string, id: bigint, title: string, body: string, viewer: string | null): Promise<WireThread> {
    const t = await this.prisma.thread.findUnique({ where: { id } });
    if (!t) throw new AppError('NOT_FOUND', 'thread not found');
    if (t.author !== principal) throw new AppError('FORBIDDEN', 'only the author can edit this thread');
    if (t.deleted) throw new AppError('DELETED', 'this thread was deleted');
    const updated = await this.prisma.thread.update({ where: { id }, data: { title, body, editedAt: this.now() } });
    const votes = await myVotesFor(this.prisma, viewer, 'THREAD', [id]);
    return toWireThread(updated, votes.get(id) ?? null);
  }

  async remove(principal: string, id: bigint): Promise<void> {
    const t = await this.prisma.thread.findUnique({ where: { id } });
    if (!t) throw new AppError('NOT_FOUND', 'thread not found');
    if (t.author !== principal) throw new AppError('FORBIDDEN', 'only the author can delete this thread');
    if (t.deleted) return;
    await this.prisma.thread.update({ where: { id }, data: { deleted: true, title: '', body: '' } });
  }
}
