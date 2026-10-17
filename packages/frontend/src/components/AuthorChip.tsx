import { useUserProfile } from '../hooks/useUserProfile';

export function shortPrincipal(principal: string): string {
  if (principal.length <= 16) return principal;
  return `${principal.slice(0, 6)}…${principal.slice(-5)}`;
}

const styles: Record<string, React.CSSProperties> = {
  chip: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 },
  avatar: { width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', background: '#eee', flexShrink: 0 },
  name: { fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '14ch' },
  principal: { fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', opacity: 0.7, whiteSpace: 'nowrap' },
};

export function AuthorChip({ principal }: { principal: string }) {
  const profile = useUserProfile(principal);
  return (
    <span style={styles.chip} title={principal}>
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" style={styles.avatar} /> : <span style={styles.avatar} aria-hidden="true" />}
      {profile.username ? <span style={styles.name}>{profile.username}</span> : <span style={styles.principal}>{shortPrincipal(principal)}</span>}
    </span>
  );
}
