import type { CommentView } from '../api/types';

export const MAX_DEPTH_DISPLAY = 8;

export interface CommentNode extends CommentView {
  children: CommentNode[];
  depth: number;
}

/**
 * Build a nested tree from the backend's flat, pre-sorted list. Input order is
 * preserved among siblings. Replies deeper than `maxDepth` are attached to the
 * nearest ancestor at `maxDepth` so the UI never nests beyond it. Orphans
 * (parent missing from the list) are treated as top-level.
 */
export function buildCommentTree(flat: CommentView[], maxDepth: number = MAX_DEPTH_DISPLAY): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const c of flat) nodes.set(c.id, { ...c, children: [], depth: 0 });

  const roots: CommentNode[] = [];
  const attached = new Set<string>();

  const attach = (node: CommentNode): void => {
    if (attached.has(node.id)) return;
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (!parent) {
      node.depth = 0;
      roots.push(node);
    } else {
      attach(parent);
      let host = parent;
      while (host.depth >= maxDepth && host.parentId !== null) {
        const up = nodes.get(host.parentId);
        if (!up) break;
        host = up;
      }
      node.depth = Math.min(host.depth + 1, maxDepth);
      host.children.push(node);
    }
    attached.add(node.id);
  };

  for (const c of flat) attach(nodes.get(c.id)!);
  return roots;
}

export function countNodes(nodes: CommentNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}
