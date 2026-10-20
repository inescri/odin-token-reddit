import type { Comment, Direction, Thread } from '@prisma/client';

import { decimalToBigint } from '../lib/amounts.js';

export type WireDirection = 'up' | 'down';

export function toWireDirection(d: Direction | null | undefined): WireDirection | null {
  if (!d) return null;
  return d === 'UP' ? 'up' : 'down';
}

export function fromWireDirection(d: WireDirection): Direction {
  return d === 'up' ? 'UP' : 'DOWN';
}

export interface WireThread {
  id: string;
  tokenId: string;
  author: string;
  title: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  score: string;
  upCount: number;
  downCount: number;
  commentCount: number;
  myVote: WireDirection | null;
}

export interface WireComment {
  id: string;
  threadId: string;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  score: string;
  upCount: number;
  downCount: number;
  myVote: WireDirection | null;
}

export function toWireThread(t: Thread, myVote: Direction | null): WireThread {
  return {
    id: t.id.toString(),
    tokenId: t.tokenId,
    author: t.author,
    title: t.title,
    body: t.body,
    createdAt: t.createdAt.toISOString(),
    editedAt: t.editedAt ? t.editedAt.toISOString() : null,
    deleted: t.deleted,
    score: decimalToBigint(t.score).toString(),
    upCount: t.upCount,
    downCount: t.downCount,
    commentCount: t.commentCount,
    myVote: toWireDirection(myVote),
  };
}

export function toWireComment(c: Comment, myVote: Direction | null): WireComment {
  return {
    id: c.id.toString(),
    threadId: c.threadId.toString(),
    parentId: c.parentId === null ? null : c.parentId.toString(),
    author: c.author,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    deleted: c.deleted,
    score: decimalToBigint(c.score).toString(),
    upCount: c.upCount,
    downCount: c.downCount,
    myVote: toWireDirection(myVote),
  };
}

export interface WireVoteOutcome {
  target: { kind: 'thread' | 'comment'; id: string };
  score: string;
  upCount: number;
  downCount: number;
  myVote: WireDirection | null;
  appliedWeight: string;
}
