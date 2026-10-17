import { useCallback, useEffect, useState } from 'react';

import { useOdinConnect } from '../odin/useOdinConnect';
import { fetchBalance } from './useBalance';

export interface VotingPowerState {
  /** Raw units; `0n` when the API reports no balance. `null` while unknown. */
  raw: bigint | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/** Approximate voting power: the Odin API balance, refreshed on load, focus, and demand. */
export function useVotingPower(tokenId: string | undefined): VotingPowerState {
  const { status, principal } = useOdinConnect();
  const [raw, setRaw] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (status !== 'connected' || principal === null || !tokenId) {
      setRaw(null);
      setError(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchBalance(principal, tokenId)
      .then((b) => {
        if (!active) return;
        setRaw(b ?? 0n);
        setError(false);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, principal, tokenId, tick]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { raw, loading, error, refresh };
}
