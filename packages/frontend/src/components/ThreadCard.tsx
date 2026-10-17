import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ThreadView, VoteOutcome } from '../api/types';
import { timeAgo } from '../lib/time';
import { AuthorChip } from './AuthorChip';
import { ui } from './ui';
import { VoteControl } from './VoteControl';

export function applyOutcomeToThread(t: ThreadView, o: VoteOutcome): ThreadView {
  return { ...t, score: o.score, upCount: o.upCount, downCount: o.downCount, myVote: o.myVote };
}

export function ThreadCard({ thread, onChange, onVoted }: { thread: ThreadView; onChange: (t: ThreadView) => void; onVoted?: () => void }) {
  const { t } = useTranslation();
  const href = `/b/${encodeURIComponent(thread.tokenId)}/t/${thread.id}`;
  return (
    <article style={ui.card}>
      <VoteControl
        compact
        target={{ kind: 'thread', id: thread.id }}
        score={thread.score}
        upCount={thread.upCount}
        downCount={thread.downCount}
        myVote={thread.myVote}
        deleted={thread.deleted}
        onOutcome={(o) => onChange(applyOutcomeToThread(thread, o))}
        onVoted={onVoted}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', overflowWrap: 'anywhere' }}>
          <Link to={href} style={{ color: 'inherit', textDecoration: 'none' }}>
            {thread.deleted ? <em style={ui.muted}>{t('thread.deletedTitle')}</em> : thread.title}
          </Link>
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', ...ui.muted }}>
          <AuthorChip principal={thread.author} />
          <span>·</span>
          <time dateTime={thread.createdAt.toISOString()}>{timeAgo(thread.createdAt)}</time>
          {thread.editedAt ? <span>· {t('thread.edited')}</span> : null}
          <span>·</span>
          <Link to={href} style={{ color: 'inherit' }}>{t('thread.comments', { count: thread.commentCount })}</Link>
        </div>
      </div>
    </article>
  );
}
