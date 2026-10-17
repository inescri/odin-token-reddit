import { useContext } from 'react';

import { SessionContext } from '../session/SessionProvider';
import type { SessionContextValue } from '../session/SessionProvider';

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
