import { Prisma } from '@prisma/client';
import type { Direction, PrismaClient, TargetKind } from '@prisma/client';
import type { Logger } from 'pino';

import { bigintToDecimal, decimalToBigint } from '../lib/amounts.js';
import { AppError } from '../lib/errors.js';
import { applyVoteDelta } from '../lib/vote-delta.js';
import type { StoredVote } from '../lib/vote-delta.js';
import { fromWireDirection, toWireDirection } from './wire.js';
import type { WireDirection, WireVoteOutcome } from './wire.js';

export interface VoteTarget {
  kind: 'thread' | 'comment';
  id: bigint;
}

interface LockedRow {
  id: bigint;
  tokenId: string;
  deleted: boolean | number;
  score: Prisma.Decimal | string | number;
  upCount: number;
  downCount: number;
}

/**
 * Applies votes inside a transaction that locks the target row, so concurrent
 * toggles by one user serialise and the counters stay consistent (SC-003).
 *
 * The weight is the client-submitted Odin API balance (spec FR-014, trusted).
 * Every accepted vote is logged with its weight for later reconciliation.
 */
export class VotesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger?: Logger,
  ) {}

  async vote(principal: string, target: VoteTarget, direction: WireDirection, weight: bigint): Promise<WireVoteOutcome> {
    const targetKind: TargetKind = target.kind === 'thread' ? 'THREAD' : 'COMMENT';
    const dir: Direction = fromWireDirection(direction);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockTarget(tx, target);
      if (!row) throw new AppError('NOT_FOUND', `${target.kind} not found`);
      if (Boolean(Number(row.deleted))) throw new AppError('DELETED', `${target.kind} was deleted`);

      const existing = await tx.vote.findUnique({
        where: { voter_targetKind_targetId: { voter: principal, targetKind, targetId: target.id } },
      });
      const prev: StoredVote | null = existing ? { direction: existing.direction, weight: decimalToBigint(existing.weight) } : null;

      const result = applyVoteDelta(
        { score: decimalToBigint(row.score), upCount: row.upCount, downCount: row.downCount },
        prev,
        dir,
        weight,
      );

      if (result.next === null) {
        await tx.vote.delete({ where: { voter_targetKind_targetId: { voter: principal, targetKind, targetId: target.id } } });
      } else {
        await tx.vote.upsert({
          where: { voter_targetKind_targetId: { voter: principal, targetKind, targetId: target.id } },
          create: { voter: principal, targetKind, targetId: target.id, direction: result.next.direction, weight: bigintToDecimal(result.next.weight) },
          update: { direction: result.next.direction, weight: bigintToDecimal(result.next.weight), castAt: new Date() },
        });
      }

      const counters = {
        score: bigintToDecimal(result.counters.score),
        upCount: result.counters.upCount,
        downCount: result.counters.downCount,
      };
      if (target.kind === 'thread') {
        await tx.thread.update({ where: { id: target.id }, data: counters });
      } else {
        await tx.comment.update({ where: { id: target.id }, data: counters });
      }

      return { result, tokenId: row.tokenId };
    });

    this.logger?.info(
      {
        audit: 'vote',
        principal,
        tokenId: outcome.tokenId,
        targetKind: target.kind,
        targetId: target.id.toString(),
        direction,
        kind: outcome.result.kind,
        submittedWeight: weight.toString(),
        appliedWeight: outcome.result.appliedWeight.toString(),
      },
      'vote accepted',
    );

    return {
      target: { kind: target.kind, id: target.id.toString() },
      score: outcome.result.counters.score.toString(),
      upCount: outcome.result.counters.upCount,
      downCount: outcome.result.counters.downCount,
      myVote: toWireDirection(outcome.result.next?.direction ?? null),
      appliedWeight: outcome.result.appliedWeight.toString(),
    };
  }

  /** `SELECT ... FOR UPDATE` on the target, joined to its board's tokenId. */
  private async lockTarget(tx: Prisma.TransactionClient, target: VoteTarget): Promise<LockedRow | null> {
    const rows =
      target.kind === 'thread'
        ? await tx.$queryRaw<LockedRow[]>(Prisma.sql`
            SELECT t.id, t.tokenId, t.deleted, t.score, t.upCount, t.downCount
            FROM \`Thread\` t WHERE t.id = ${target.id} FOR UPDATE`)
        : await tx.$queryRaw<LockedRow[]>(Prisma.sql`
            SELECT c.id, t.tokenId, c.deleted, c.score, c.upCount, c.downCount
            FROM \`Comment\` c JOIN \`Thread\` t ON t.id = c.threadId
            WHERE c.id = ${target.id} FOR UPDATE`);
    const row = rows[0];
    if (!row) return null;
    // Raw MySQL BIGINT arrives as bigint; counters as number.
    return { ...row, id: BigInt(row.id), upCount: Number(row.upCount), downCount: Number(row.downCount) };
  }
}
