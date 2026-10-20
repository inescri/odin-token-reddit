import { useCallback, useState } from 'react';

import { ApiError } from '../api/client';
import { toVoteOutcome } from '../api/types';
import type { VoteDirection, VoteOutcome, WireVoteOutcome } from '../api/types';
import { useOdinConnect } from '../odin/useOdinConnect';
import { fetchBalance } from './useBalance';
import { useAuthedFetch } from './useAuthedFetch';
import { useSession } from './useSession';

export type VoteErrorCode = 'NO_BALANCE' | 'BALANCE_UNAVAILABLE' | 'SESSION' | 'DELETED' | 'NOT_FOUND' | 'OTHER';

export interface VoteError {
  code: VoteErrorCode;
  message: string;
}

export interface VoteTarget {
  kind: 'thread' | 'comment';
  id: string;
}

export interface UseVote {
  /** True when the user must connect with Odin before voting. */
  needsSignIn: boolean;
  pending: boolean;
  error: VoteError | null;
  /** Weight applied by the last successful cast/flip (null after a retract). */
  lastApplied: bigint | null;
  clear: () => void;
  vote: (target: VoteTarget, direction: VoteDirection, currentVote: VoteDirection | null) => Promise<VoteOutcome | null>;
}

/**
 * Casting fetches the voter's balance from the Odin API through the SDK right
 * before `POST /votes` and submits it as the weight (spec FR-014). A retract
 * (same direction again) always goes through, even at zero balance.
 */
export function useVote(tokenId: string | undefined): UseVote {
  const { status, principal } = useOdinConnect();
  const session = useSession();
  const fetchApi = useAuthedFetch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<VoteError | null>(null);
  const [lastApplied, setLastApplied] = useState<bigint | null>(null);

  const needsSignIn = status !== 'connected' || principal === null;

  const vote = useCallback<UseVote['vote']>(
    async (target, direction, currentVote) => {
      setError(null);
      setLastApplied(null);
      if (needsSignIn || principal === null || !tokenId) return null;
      if (session.status !== 'ready') {
        setError({ code: 'SESSION', message: 'board session not ready' });
        return null;
      }
      setPending(true);
      try {
        const isRetract = currentVote === direction;
        let weight = 0n;
        if (!isRetract) {
          let balance: bigint | null;
          try {
            balance = await fetchBalance(principal, tokenId);
          } catch {
            setError({ code: 'BALANCE_UNAVAILABLE', message: 'could not read balance' });
            return null;
          }
          if (balance === null || balance <= 0n) {
            setError({ code: 'NO_BALANCE', message: 'no balance' });
            return null;
          }
          weight = balance;
        }
        const wire = await fetchApi<WireVoteOutcome>('/votes', {
          method: 'POST',
          body: { target, direction, weight: weight.toString() },
        });
        const outcome = toVoteOutcome(wire);
        setLastApplied(outcome.myVote === null ? null : outcome.appliedWeight);
        return outcome;
      } catch (e) {
        if (e instanceof ApiError) {
          const code: VoteErrorCode =
            e.code === 'NO_BALANCE' ? 'NO_BALANCE' : e.code === 'DELETED' ? 'DELETED' : e.code === 'NOT_FOUND' ? 'NOT_FOUND' : e.status === 401 ? 'SESSION' : 'OTHER';
          setError({ code, message: e.message });
        } else {
          setError({ code: 'OTHER', message: e instanceof Error ? e.message : 'vote failed' });
        }
        return null;
      } finally {
        setPending(false);
      }
    },
    [needsSignIn, principal, tokenId, session.status, fetchApi],
  );

  const clear = useCallback(() => {
    setError(null);
    setLastApplied(null);
  }, []);

  return { needsSignIn, pending, error, lastApplied, clear, vote };
}
