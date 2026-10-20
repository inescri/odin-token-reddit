import { AppError } from './errors.js';

export type Direction = 'UP' | 'DOWN';

export interface VoteCounters {
  score: bigint;
  upCount: number;
  downCount: number;
}

export interface StoredVote {
  direction: Direction;
  weight: bigint;
}

export type VoteKind = 'cast' | 'retract' | 'flip';

export interface VoteDeltaResult {
  kind: VoteKind;
  counters: VoteCounters;
  /** The vote row to store, or `null` to delete the existing row. */
  next: StoredVote | null;
  /** Weight applied by this action; `0n` on retract. */
  appliedWeight: bigint;
}

/**
 * Pure vote arithmetic. See data-model.md "Vote delta rules".
 *
 * - cast:    no prior vote → add `weight` in `direction`
 * - retract: same direction again → remove the prior vote using ITS stored weight
 * - flip:    opposite direction → remove prior (stored weight), add `weight`
 *
 * Cast and flip require `weight > 0`. Retract ignores `weight`, so a holder who
 * sold everything can still undo exactly what they added.
 */
export function applyVoteDelta(
  item: VoteCounters,
  prev: StoredVote | null,
  direction: Direction,
  weight: bigint,
): VoteDeltaResult {
  if (weight < 0n) throw new AppError('INVALID_INPUT', 'weight must not be negative');

  let { score, upCount, downCount } = item;

  if (prev !== null) {
    // Remove the prior vote.
    if (prev.direction === 'UP') {
      score -= prev.weight;
      upCount -= 1;
    } else {
      score += prev.weight;
      downCount -= 1;
    }
    if (prev.direction === direction) {
      return {
        kind: 'retract',
        counters: { score, upCount: Math.max(0, upCount), downCount: Math.max(0, downCount) },
        next: null,
        appliedWeight: 0n,
      };
    }
  }

  if (weight === 0n) throw new AppError('NO_BALANCE', 'voting on this board requires holding its token');

  if (direction === 'UP') {
    score += weight;
    upCount += 1;
  } else {
    score -= weight;
    downCount += 1;
  }

  return {
    kind: prev === null ? 'cast' : 'flip',
    counters: { score, upCount: Math.max(0, upCount), downCount: Math.max(0, downCount) },
    next: { direction, weight },
    appliedWeight: weight,
  };
}
