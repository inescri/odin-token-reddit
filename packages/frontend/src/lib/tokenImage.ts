import { OdinUtils } from 'odin-connect';

import { odin } from '../odin/client';

/** Env-aware token image URL. Staging shares prod's image host. */
export function tokenImageUrl(tokenId: string): string {
  const env = odin.currentEnv;
  const imageEnv = env === 'staging' ? 'prod' : env;
  return OdinUtils.buildTokenImageUrl(tokenId, imageEnv);
}
