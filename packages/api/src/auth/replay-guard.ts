import { createHash } from 'node:crypto';

import { AppError } from '../lib/errors.js';

export const REPLAY_TTL_MS = 10 * 60 * 1000;

/**
 * Remembers login signatures for `ttlMs` so the same signed payload cannot be
 * presented twice inside the timestamp window. In-memory: correct for a single
 * API instance. Move to MySQL or Redis before running several instances.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();
  private ops = 0;

  constructor(
    private readonly ttlMs: number = REPLAY_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Throws `REPLAY` if this signature was accepted before; otherwise records it. */
  assertFresh(signatureB64: string): void {
    const key = createHash('sha256').update(signatureB64).digest('hex');
    const t = this.now();
    const exp = this.seen.get(key);
    if (exp !== undefined && exp > t) {
      throw new AppError('REPLAY', 'this login was already used');
    }
    this.seen.set(key, t + this.ttlMs);
    if (++this.ops % 256 === 0) this.sweep(t);
  }

  private sweep(t: number): void {
    for (const [k, exp] of this.seen) {
      if (exp <= t) this.seen.delete(k);
    }
  }

  get size(): number {
    return this.seen.size;
  }
}
