import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { CommentSort } from '../api/types';
import { AuthorChip } from '../components/AuthorChip';
import { applyOutcomeToThread } from '../components/ThreadCard';
import { CommentTree } from '../components/CommentTree';
import { Composer } from '../components/Composer';
import { PostText } from '../components/PostText';
import { VoteControl } from '../components/VoteControl';
import { VotingPower } from '../components/VotingPower';
import { ui } from '../components/ui';
import { TokenMetaContext } from '../context/TokenMetaContext';
import { useComments } from '../hooks/useComments';
import { useThread } from '../hooks/useThread';
import { useToken } from '../hooks/useToken';
import { useVotingPower } from '../hooks/useVotingPower';
import { displayExponent } from '../lib/amounts';
import { buildCommentTree } from '../lib/commentTree';
import { timeAgo } from '../lib/time';
import { useOdinConnect } from '../odin/useOdinConnect';

const SORTS: CommentSort[] = ['top', 'new'];

export function ThreadPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tokenId, threadId } = useParams<{ tokenId: string; threadId: string }>();
  const [params, setParams] = useSearchParams();
  const sort: CommentSort = params.get('sort') === 'new' ? 'new' : 'top';
  const { principal } = useOdinConnect();

  const { token } = useToken(tokenId);
  const thread = useThread(threadId);
  const comments = useComments(threadId, sort);
  const power = useVotingPower(tokenId);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const tree = useMemo(() => buildCommentTree(comments.items), [comments.items]);
  const meta = token && tokenId ? { tokenId, ticker: token.ticker, divisibility: token.divisibility, decimals: token.decimals } : null;
  const exponent = token ? displayExponent(token) : 0;
  const boardHref = `/b/${encodeURIComponent(tokenId ?? '')}`;

  if (thread.notFound) {
    return (
      <section>
        <h2>{t('thread.notFound')}</h2>
        <Link to={boardHref}>{t('thread.backToBoard')}</Link>
      </section>
    );
  }
  if (thread.error) {
    return <p role="alert" style={ui.error}>{t('thread.loadError', { message: thread.error })}</p>;
  }
  const item = thread.thread;
  if (!item) return <p style={ui.muted}>{t('thread.loading')}</p>;

  const isAuthor = principal !== null && principal === item.author;

  const del = async () => {
    if (!window.confirm(t('thread.confirmDelete'))) return;
    setBusy(true);
    try {
      await thread.remove();
      void navigate(boardHref);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TokenMetaContext.Provider value={meta}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <nav style={ui.muted}>
          <Link to="/" style={{ color: 'inherit' }}>{t('thread.home')}</Link> / <Link to={boardHref} style={{ color: 'inherit' }}>{token?.ticker ?? tokenId}</Link>
        </nav>

        {token ? <VotingPower power={power} ticker={token.ticker} exponent={exponent} /> : null}

        <article style={ui.card}>
          <VoteControl
            target={{ kind: 'thread', id: item.id }}
            score={item.score}
            upCount={item.upCount}
            downCount={item.downCount}
            myVote={item.myVote}
            deleted={item.deleted}
            onOutcome={(o) => thread.setThread(applyOutcomeToThread(item, o))}
            onVoted={power.refresh}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            {item.deleted ? (
              <h2 style={{ margin: '0 0 0.3rem' }}><em style={ui.muted}>{t('thread.deletedTitle')}</em></h2>
            ) : editing ? (
              <Composer
                mode="thread"
                submitLabel={t('thread.save')}
                initialTitle={item.title}
                initialBody={item.body}
                autoFocus
                onCancel={() => setEditing(false)}
                onSubmit={({ title, body }) => thread.edit(title, body)}
              />
            ) : (
              <>
                <h2 style={{ margin: '0 0 0.3rem', overflowWrap: 'anywhere' }}>{item.title}</h2>
                {item.body ? <PostText text={item.body} /> : null}
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem', ...ui.muted }}>
              <AuthorChip principal={item.author} />
              <span>·</span>
              <time dateTime={item.createdAt.toISOString()}>{timeAgo(item.createdAt)}</time>
              {item.editedAt ? <span>· {t('thread.edited')}</span> : null}
              {isAuthor && !item.deleted && !editing ? (
                <>
                  <button type="button" style={ui.link} onClick={() => setEditing(true)}>{t('thread.edit')}</button>
                  <button type="button" style={ui.link} disabled={busy} onClick={() => void del()}>{t('thread.delete')}</button>
                </>
              ) : null}
            </div>
          </div>
        </article>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>{t('thread.comments', { count: item.commentCount })}</h3>
          <nav aria-label={t('thread.sortLabel')} style={{ display: 'flex', gap: '0.4rem' }}>
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                style={ui.tab(sort === s)}
                aria-pressed={sort === s}
                onClick={() => {
                  const p = new URLSearchParams(params);
                  if (s === 'top') p.delete('sort');
                  else p.set('sort', s);
                  setParams(p, { replace: true });
                }}
              >
                {t(`thread.sort.${s}`)}
              </button>
            ))}
          </nav>
        </div>

        {!item.deleted ? (
          <Composer
            mode="comment"
            submitLabel={t('composer.postComment')}
            onSubmit={async ({ body }) => {
              await comments.create(body, null);
              thread.setThread({ ...item, commentCount: item.commentCount + 1 });
            }}
          />
        ) : (
          <p style={ui.muted}>{t('thread.deletedNoReplies')}</p>
        )}

        {comments.error ? <p role="alert" style={ui.error}>{t('thread.commentsError', { message: comments.error })}</p> : null}
        {comments.loading && comments.items.length === 0 ? <p style={ui.muted}>{t('thread.loadingComments')}</p> : null}
        {!comments.loading && comments.items.length === 0 ? <p style={ui.muted}>{t('thread.noComments')}</p> : null}

        <CommentTree
          nodes={tree}
          threadDeleted={item.deleted}
          onReply={async (body, parentId) => {
            await comments.create(body, parentId);
            thread.setThread({ ...item, commentCount: item.commentCount + 1 });
          }}
          onEdit={comments.edit}
          onDelete={async (id) => {
            await comments.remove(id);
            thread.setThread({ ...item, commentCount: Math.max(0, item.commentCount - 1) });
          }}
          onChange={comments.replace}
          onVoted={power.refresh}
        />
      </section>
    </TokenMetaContext.Provider>
  );
}
