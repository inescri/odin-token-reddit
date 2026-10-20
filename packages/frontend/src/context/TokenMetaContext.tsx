import { createContext, useContext } from 'react';

export interface TokenMeta {
  tokenId: string;
  ticker: string;
  divisibility: number;
  decimals: number;
}

export const TokenMetaContext = createContext<TokenMeta | null>(null);

export function useTokenMeta(): TokenMeta | null {
  return useContext(TokenMetaContext);
}
