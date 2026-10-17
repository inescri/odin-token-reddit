import { describe, expect, it } from 'vitest';

import type { CommentView } from '../api/types';
import { buildCommentTree, countNodes } from './commentTree';

const c = (id: string, parentId: string | null): CommentView => ({
  id, threadId: '1', parentId, author: 'a', body: id, createdAt: new Date(0), editedAt: null, deleted: false,
  score: 0n, upCount: 0, downCount: 0, myVote: null,
});

describe('buildCommentTree', () => {
  it('nests by parentId and preserves sibling order', () => {
    const tree = buildCommentTree([c('2', null), c('1', null), c('3', '2'), c('4', '2'), c('5', '3')]);
    expect(tree.map((n) => n.id)).toEqual(['2', '1']);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(['3', '4']);
    expect(tree[0]!.children[0]!.children[0]!.id).toBe('5');
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
    expect(countNodes(tree)).toBe(5);
  });
  it('treats orphans as roots and handles child-before-parent input', () => {
    const tree = buildCommentTree([c('b', 'a'), c('a', null), c('x', 'missing')]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'x']);
    expect(tree[0]!.children[0]!.id).toBe('b');
  });
  it('caps depth: deeper replies attach at the cap', () => {
    const flat: CommentView[] = [c('0', null)];
    for (let i = 1; i <= 12; i++) flat.push(c(String(i), String(i - 1)));
    const tree = buildCommentTree(flat, 3);
    // Walk to the last node above the cap (depth 2).
    let host = tree[0]!;
    while (host.depth < 2) host = host.children[0]!;
    expect(host.id).toBe('2');
    // Everything from depth 3 downward is flattened at the cap, in order, under it.
    expect(host.children.map((n) => n.id)).toEqual(['3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(host.children.every((n) => n.depth === 3 && n.children.length === 0)).toBe(true);
    expect(countNodes(tree)).toBe(13);
  });
});
