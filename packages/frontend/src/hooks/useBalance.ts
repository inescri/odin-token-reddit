import { odin } from '../odin/client';

/**
 * The voter's balance of `tokenId` in raw units, as the Odin API reports it.
 * `null` when the API has no balance row (never held). Throws on API failure.
 */
export async function fetchBalance(principal: string, tokenId: string): Promise<bigint | null> {
  const b = await odin.api.getBalance(principal, tokenId);
  return b === null ? null : BigInt(b.balance);
}
