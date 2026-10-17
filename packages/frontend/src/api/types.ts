/** Wire types from packages/api (contracts/backend-api.md). Big numbers are decimal strings. */

export type VoteDirection = 'up' | 'down';
export type ThreadSort = 'top' | 'new' | 'hot';
export type CommentSort = 'top' | 'new';

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
  myVote: VoteDirection | null;
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
  myVote: VoteDirection | null;
}

export interface WireVoteOutcome {
  target: { kind: 'thread' | 'comment'; id: string };
  score: string;
  upCount: number;
  downCount: number;
  myVote: VoteDirection | null;
  appliedWeight: string;
}

export interface BoardStats {
  tokenId: string;
  threadCount: number;
  lastActivity: string | null;
}

export interface WireError {
  error: { code: string; message: string };
}

/** View types: scores as bigint, dates as Date. */
export interface ThreadView extends Omit<WireThread, 'score' | 'createdAt' | 'editedAt'> {
  score: bigint;
  createdAt: Date;
  editedAt: Date | null;
}

export interface CommentView extends Omit<WireComment, 'score' | 'createdAt' | 'editedAt'> {
  score: bigint;
  createdAt: Date;
  editedAt: Date | null;
}

export interface VoteOutcome extends Omit<WireVoteOutcome, 'score' | 'appliedWeight'> {
  score: bigint;
  appliedWeight: bigint;
}

export function toThreadView(w: WireThread): ThreadView {
  return { ...w, score: BigInt(w.score), createdAt: new Date(w.createdAt), editedAt: w.editedAt ? new Date(w.editedAt) : null };
}

export function toCommentView(w: WireComment): CommentView {
  return { ...w, score: BigInt(w.score), createdAt: new Date(w.createdAt), editedAt: w.editedAt ? new Date(w.editedAt) : null };
}

export function toVoteOutcome(w: WireVoteOutcome): VoteOutcome {
  return { ...w, score: BigInt(w.score), appliedWeight: BigInt(w.appliedWeight) };
}
