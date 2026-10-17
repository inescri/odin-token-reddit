import { AppError } from './errors.js';

export const TITLE_MAX = 200;
export const THREAD_BODY_MAX = 10_000;
export const COMMENT_BODY_MAX = 5_000;
export const TOKEN_ID_MAX = 64;
export const POST_COOLDOWN_MS = 30_000;
export const PAGE_LIMIT_MAX = 50;
export const PAGE_LIMIT_DEFAULT = 25;

export type ThreadSort = 'top' | 'new' | 'hot';
export type CommentSort = 'top' | 'new';

function invalid(message: string): never {
  throw new AppError('INVALID_INPUT', message);
}

/** Collapse Windows newlines; keep other whitespace so formatting survives. */
function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

export function validateTitle(raw: unknown): string {
  if (typeof raw !== 'string') invalid('title must be a string');
  const title = normalize(raw).replace(/\s*\n\s*/g, ' ');
  if (title.length === 0) invalid('title is required');
  if (title.length > TITLE_MAX) invalid(`title must be at most ${TITLE_MAX} characters`);
  return title;
}

export function validateThreadBody(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') invalid('body must be a string');
  const body = normalize(raw);
  if (body.length > THREAD_BODY_MAX) invalid(`body must be at most ${THREAD_BODY_MAX} characters`);
  return body;
}

export function validateCommentBody(raw: unknown): string {
  if (typeof raw !== 'string') invalid('body must be a string');
  const body = normalize(raw);
  if (body.length === 0) invalid('comment body is required');
  if (body.length > COMMENT_BODY_MAX) invalid(`comment must be at most ${COMMENT_BODY_MAX} characters`);
  return body;
}

export function validateTokenId(raw: unknown): string {
  if (typeof raw !== 'string') invalid('tokenId must be a string');
  const id = raw.trim();
  if (id.length === 0) invalid('tokenId is required');
  if (id.length > TOKEN_ID_MAX) invalid(`tokenId must be at most ${TOKEN_ID_MAX} characters`);
  if (/\s/.test(id)) invalid('tokenId must not contain whitespace');
  return id;
}

export function parseThreadSort(raw: unknown): ThreadSort {
  if (raw === undefined || raw === '' || raw === 'hot') return 'hot';
  if (raw === 'top' || raw === 'new') return raw;
  invalid('sort must be one of top, new, hot');
}

export function parseCommentSort(raw: unknown): CommentSort {
  if (raw === undefined || raw === '' || raw === 'top') return 'top';
  if (raw === 'new') return 'new';
  invalid('sort must be one of top, new');
}

export function parsePage(raw: unknown): number {
  if (raw === undefined || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) invalid('page must be a positive integer');
  return n;
}

export function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === '') return PAGE_LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) invalid('limit must be a positive integer');
  return Math.min(n, PAGE_LIMIT_MAX);
}

/** Route ids arrive as strings; MySQL BIGINT ids are positive. */
export function parseId(raw: unknown, name = 'id'): bigint {
  if (typeof raw !== 'string' || !/^[0-9]{1,19}$/.test(raw)) invalid(`${name} must be a positive integer`);
  const id = BigInt(raw);
  if (id <= 0n) invalid(`${name} must be a positive integer`);
  return id;
}

/** Seconds a principal must still wait before posting again, or 0. */
export function cooldownRemainingSeconds(lastPostAt: Date | null, now: Date, cooldownMs: number = POST_COOLDOWN_MS): number {
  if (lastPostAt === null || cooldownMs <= 0) return 0;
  const remainingMs = lastPostAt.getTime() + cooldownMs - now.getTime();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
