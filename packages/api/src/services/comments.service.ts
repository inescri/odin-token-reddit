import type { PrismaClient } from '@prisma/client';

import { AppError } from '../lib/errors.js';
import { commentOrderBy } from '../lib/ranking.js';
import type { CommentSort } from '../lib/validation.js';
import { enforcePostCooldown } from './cooldown.js';
import type { ServiceOptions } from './options.js';
import { myVotesFor } from './votes-lookup.js';
import { toWireComment } from './wire.js';
import type { WireComment } from './wire.js';

export class CommentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: ServiceOptions = {},
  ) {}

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  async list(threadId: bigint, sort: CommentSort, viewer: string | null): Promise<WireComment[]> {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId }, select: { id: true } });
    if (!thread) throw new AppError('NOT_FOUND', 'thread not found');
    const rows = await this.prisma.comment.findMany({ where: { threadId }, orderBy: commentOrderBy(sort) });
    const votes = await myVotesFor(this.prisma, viewer, 'COMMENT', rows.map((c) => c.id));
    return rows.map((c) => toWireComment(c, votes.get(c.id) ?? null));
  }

  async create(principal: string, threadId: bigint, parentId: bigint | null, body: string): Promise<WireComment> {
    const now = this.now();
    const created = await this.prisma.$transaction(async (tx) => {
      const thread = await tx.thread.findUnique({ where: { id: threadId }, select: { id: true, deleted: true } });
      if (!thread) throw new AppError('NOT_FOUND', 'thread not found');
      if (thread.deleted) throw new AppError('DELETED', 'cannot comment on a deleted thread');
      if (parentId !== null) {
        const parent = await tx.comment.findUnique({ where: { id: parentId }, select: { threadId: true, deleted: true } });
        if (!parent || parent.threadId !== threadId) throw new AppError('NOT_FOUND', 'parent comment not found in this thread');
        if (parent.deleted) throw new AppError('DELETED', 'cannot reply to a deleted comment');
      }
      await enforcePostCooldown(tx, principal, now, this.opts.cooldownMs);
      const comment = await tx.comment.create({ data: { threadId, parentId, author: principal, body, createdAt: now } });
      await tx.thread.update({ where: { id: threadId }, data: { commentCount: { increment: 1 } } });
      return comment;
    });
    return toWireComment(created, null);
  }

  async edit(principal: string, id: bigint, body: string, viewer: string | null): Promise<WireComment> {
    const c = await this.prisma.comment.findUnique({ where: { id } });
    if (!c) throw new AppError('NOT_FOUND', 'comment not found');
    if (c.author !== principal) throw new AppError('FORBIDDEN', 'only the author can edit this comment');
    if (c.deleted) throw new AppError('DELETED', 'this comment was deleted');
    const updated = await this.prisma.comment.update({ where: { id }, data: { body, editedAt: this.now() } });
    const votes = await myVotesFor(this.prisma, viewer, 'COMMENT', [id]);
    return toWireComment(updated, votes.get(id) ?? null);
  }

  async remove(principal: string, id: bigint): Promise<void> {
    const c = await this.prisma.comment.findUnique({ where: { id } });
    if (!c) throw new AppError('NOT_FOUND', 'comment not found');
    if (c.author !== principal) throw new AppError('FORBIDDEN', 'only the author can delete this comment');
    if (c.deleted) return;
    await this.prisma.$transaction(async (tx) => {
      // Conditional on `deleted: false` so only one of several concurrent
      // deletes flips the row and decrements the count.
      const { count } = await tx.comment.updateMany({ where: { id, deleted: false }, data: { deleted: true, body: '' } });
      if (count === 1) {
        await tx.thread.update({ where: { id: c.threadId }, data: { commentCount: { decrement: 1 } } });
      }
    });
  }
}
