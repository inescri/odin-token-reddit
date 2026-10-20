import { useEffect, useState } from 'react';
import type { OdinUser } from 'odin-connect';

import { odin } from '../odin/client';

export interface Profile {
  principal: string;
  username: string | null;
  avatarUrl: string | null;
}

const cache = new Map<string, Promise<Profile>>();

function fetchProfile(principal: string): Promise<Profile> {
  let p = cache.get(principal);
  if (!p) {
    p = odin.api
      .getUser(principal)
      .then((u: OdinUser) => ({ principal, username: u.username || null, avatarUrl: u.image ? odin.api.getUserAvatarUrl(principal) : null }))
      .catch(() => ({ principal, username: null, avatarUrl: null }));
    cache.set(principal, p);
  }
  return p;
}

export function useUserProfile(principal: string): Profile {
  const [profile, setProfile] = useState<Profile>({ principal, username: null, avatarUrl: null });
  useEffect(() => {
    let active = true;
    fetchProfile(principal).then((p) => active && setProfile(p));
    return () => {
      active = false;
    };
  }, [principal]);
  return profile;
}
