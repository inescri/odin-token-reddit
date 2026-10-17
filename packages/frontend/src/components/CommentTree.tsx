import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CommentView, VoteOutcome } from '../api/types';
import type { CommentNode } from '../lib/commentTree';
import { timeAgo } from '../lib/time';
import { useOdinConnect } from '../odin/useOdinConnect';
import { AuthorChip } from './AuthorChip';
import { Composer } from './Composer';
import { PostText } from './PostText';
import { ui } from './ui';
import { VoteControl } from './VoteControl';

export interface CommentTreeProps {
  nodes: CommentNode[];
  threadDeleted: boolean;
  onReply: (body: string, parentId: string) => Promise<unknown>;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onChange: (c: CommentView) => void;
  onVoted?: () => void;
}

export function applyOutcomeToComment(c: CommentView, o: VoteOutcome): CommentView {
  return { ...c, score: o.score, upCount: o.upCount, downCount: o.downCount, myVote: o.myVote };
}

export function CommentTree(props: CommentTreeProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {props.nodes.map((node) => (
        <CommentItem key={node.id} node={node} {...props} />
      ))}
    </div>
  );
}

function CommentItem({ node, ...props }: CommentTreeProps & { node: CommentNode }) {
  const { t } = useTranslation();
  const { principal } = useOdinConnect();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAuthor = principal !== null && principal === node.author;

  const del = async () => {
    if (!window.confirm(t('comment.confirmDelete'))) return;
    setBusy(true);
    try {
      await props.onDelete(node.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginLeft: node.depth === 0 ? 0 : 12, borderLeft: node.depth === 0 ? 'none' : '2px solid #eee', paddingLeft: node.depth === 0 ? 0 : 10 }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <VoteControl
          compact
          target={{ kind: 'comment', id: node.id }}
          score={node.score}
          upCount={node.upCount}
          downCount={node.downCount}
          myVote={node.myVote}
          deleted={node.deleted}
          onOutcome={(o) => props.onChange(applyOutcomeToComment(node, o))}
          onVoted={props.onVoted}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', ...ui.muted }}>
            <AuthorChip principal={node.author} />
            <span>·</span>
            <time dateTime={node.createdAt.toISOString()}>{timeAgo(node.createdAt)}</time>
            {node.editedAt ? <span>· {t('comment.edited')}</span> : null}
          </div>
          {node.deleted ? (
            <em style={ui.muted}>{t('comment.deleted')}</em>
          ) : editing ? (
            <Composer
              mode="comment"
              submitLabel={t('comment.save')}
              initialBody={node.body}
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={({ body }) => props.onEdit(node.id, body)}
            />
          ) : (
            <PostText text={node.body} style={{ margin: '0.2rem 0' }} />
          )}
          {!node.deleted && !editing ? (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem' }}>
              {!props.threadDeleted ? (
                <button type="button" style={ui.link} onClick={() => setReplying((v) => !v)}>{t('comment.reply')}</button>
              ) : null}
              {isAuthor ? (
                <>
                  <button type="button" style={ui.link} onClick={() => setEditing(true)}>{t('comment.edit')}</button>
                  <button type="button" style={ui.link} disabled={busy} onClick={() => void del()}>{t('comment.delete')}</button>
                </>
              ) : null}
            </div>
          ) : null}
          {replying ? (
            <div style={{ marginTop: '0.4rem' }}>
              <Composer
                mode="comment"
                submitLabel={t('comment.reply')}
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={({ body }) => props.onReply(body, node.id)}
              />
            </div>
          ) : null}
        </div>
      </div>
      {node.children.length > 0 ? (
        <div style={{ marginTop: '0.5rem' }}>
          <CommentTree {...props} nodes={node.children} />
        </div>
      ) : null}
    </div>
  );
}
