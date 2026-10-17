import { describe, expect, it } from 'vitest';

import { AppError } from '../src/lib/errors.js';
import { applyVoteDelta } from '../src/lib/vote-delta.js';

const item = { score: 100n, upCount: 2, downCount: 1 };

describe('applyVoteDelta', () => {
  it('cast up', () => {
    const r = applyVoteDelta(item, null, 'UP', 50n);
    expect(r).toEqual({ kind: 'cast', counters: { score: 150n, upCount: 3, downCount: 1 }, next: { direction: 'UP', weight: 50n }, appliedWeight: 50n });
  });
  it('cast down', () => {
    const r = applyVoteDelta(item, null, 'DOWN', 50n);
    expect(r.counters).toEqual({ score: 50n, upCount: 2, downCount: 2 });
    expect(r.next).toEqual({ direction: 'DOWN', weight: 50n });
  });
  it('retract up uses the stored weight, not the submitted one', () => {
    const r = applyVoteDelta(item, { direction: 'UP', weight: 30n }, 'UP', 999n);
    expect(r).toEqual({ kind: 'retract', counters: { score: 70n, upCount: 1, downCount: 1 }, next: null, appliedWeight: 0n });
  });
  it('retract down', () => {
    const r = applyVoteDelta(item, { direction: 'DOWN', weight: 30n }, 'DOWN', 0n);
    expect(r.counters).toEqual({ score: 130n, upCount: 2, downCount: 0 });
    expect(r.next).toBeNull();
  });
  it('flip up → down removes old weight and adds new', () => {
    const r = applyVoteDelta(item, { direction: 'UP', weight: 30n }, 'DOWN', 40n);
    expect(r).toEqual({ kind: 'flip', counters: { score: 30n, upCount: 1, downCount: 2 }, next: { direction: 'DOWN', weight: 40n }, appliedWeight: 40n });
  });
  it('flip down → up', () => {
    const r = applyVoteDelta(item, { direction: 'DOWN', weight: 30n }, 'UP', 40n);
    expect(r.counters).toEqual({ score: 170n, upCount: 3, downCount: 0 });
  });
  it('retract works at zero balance', () => {
    expect(applyVoteDelta(item, { direction: 'UP', weight: 100n }, 'UP', 0n).counters.score).toBe(0n);
  });
  it('cast and flip at zero weight raise NO_BALANCE without changing anything', () => {
    expect(() => applyVoteDelta(item, null, 'UP', 0n)).toThrowError(AppError);
    try { applyVoteDelta(item, { direction: 'UP', weight: 5n }, 'DOWN', 0n); } catch (e) { expect((e as AppError).code).toBe('NO_BALANCE'); }
  });
  it('rejects negative weight', () => {
    expect(() => applyVoteDelta(item, null, 'UP', -1n)).toThrowError(AppError);
  });
  it('handles 40-digit weights exactly', () => {
    const big = BigInt('9'.repeat(39));
    const r = applyVoteDelta({ score: 0n, upCount: 0, downCount: 0 }, null, 'UP', big);
    expect(r.counters.score).toBe(big);
    const back = applyVoteDelta(r.counters, r.next, 'UP', 1n);
    expect(back.counters.score).toBe(0n);
  });
});
