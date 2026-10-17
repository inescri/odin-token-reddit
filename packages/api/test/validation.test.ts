import { describe, expect, it } from 'vitest';

import { AppError } from '../src/lib/errors.js';
import {
  clampLimit, cooldownRemainingSeconds, parseCommentSort, parseId, parsePage, parseThreadSort,
  validateCommentBody, validateThreadBody, validateTitle, validateTokenId,
} from '../src/lib/validation.js';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as AppError).code; } return 'none'; };

describe('validation', () => {
  it('title: trims, collapses newlines, enforces 1..200', () => {
    expect(validateTitle('  Hello\n world ')).toBe('Hello world');
    expect(code(() => validateTitle('   '))).toBe('INVALID_INPUT');
    expect(code(() => validateTitle('x'.repeat(201)))).toBe('INVALID_INPUT');
    expect(validateTitle('x'.repeat(200))).toHaveLength(200);
  });
  it('thread body optional up to 10000; comment body required up to 5000', () => {
    expect(validateThreadBody(undefined)).toBe('');
    expect(validateThreadBody(' a\r\nb ')).toBe('a\nb');
    expect(code(() => validateThreadBody('x'.repeat(10_001)))).toBe('INVALID_INPUT');
    expect(code(() => validateCommentBody(' \n '))).toBe('INVALID_INPUT');
    expect(code(() => validateCommentBody('x'.repeat(5_001)))).toBe('INVALID_INPUT');
    expect(validateCommentBody('ok')).toBe('ok');
  });
  it('tokenId: non-empty, ≤64, no whitespace', () => {
    expect(validateTokenId(' 2jjj ')).toBe('2jjj');
    expect(code(() => validateTokenId('a b'))).toBe('INVALID_INPUT');
    expect(code(() => validateTokenId('x'.repeat(65)))).toBe('INVALID_INPUT');
    expect(code(() => validateTokenId(''))).toBe('INVALID_INPUT');
  });
  it('sort/page/limit parsing', () => {
    expect(parseThreadSort(undefined)).toBe('hot');
    expect(parseThreadSort('top')).toBe('top');
    expect(code(() => parseThreadSort('weird'))).toBe('INVALID_INPUT');
    expect(parseCommentSort(undefined)).toBe('top');
    expect(code(() => parseCommentSort('hot'))).toBe('INVALID_INPUT');
    expect(parsePage(undefined)).toBe(1);
    expect(code(() => parsePage('0'))).toBe('INVALID_INPUT');
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit('500')).toBe(50);
    expect(code(() => clampLimit('-1'))).toBe('INVALID_INPUT');
  });
  it('ids', () => {
    expect(parseId('42')).toBe(42n);
    expect(code(() => parseId('0'))).toBe('INVALID_INPUT');
    expect(code(() => parseId('abc'))).toBe('INVALID_INPUT');
  });
  it('cooldown', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    expect(cooldownRemainingSeconds(null, now)).toBe(0);
    expect(cooldownRemainingSeconds(new Date(now.getTime() - 10_000), now)).toBe(20);
    expect(cooldownRemainingSeconds(new Date(now.getTime() - 40_000), now)).toBe(0);
  });
});
