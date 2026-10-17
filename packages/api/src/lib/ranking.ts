import { Prisma } from '@prisma/client';

import type { CommentSort, ThreadSort } from './validation.js';

/** Threads hidden from board listings: deleted with no comments. */
export const listedThreadWhere = (tokenId: string): Prisma.ThreadWhereInput => ({
  tokenId,
  OR: [{ deleted: false }, { commentCount: { gt: 0 } }],
});

export function threadOrderBy(sort: Exclude<ThreadSort, 'hot'>): Prisma.ThreadOrderByWithRelationInput[] {
  return sort === 'top'
    ? [{ score: 'desc' }, { createdAt: 'desc' }]
    : [{ createdAt: 'desc' }];
}

export function commentOrderBy(sort: CommentSort): Prisma.CommentOrderByWithRelationInput[] {
  return sort === 'top'
    ? [{ score: 'desc' }, { createdAt: 'desc' }]
    : [{ createdAt: 'desc' }];
}

/**
 * Hot = (score in display units) / (ageHours + 2)^1.5. Computed in SQL so the
 * whole board is ordered before pagination. Ordering only — never stored.
 * Returns the page of thread ids in rank order; the caller hydrates them.
 */
export function hotThreadIdsSql(tokenId: string, limit: number, offset: number): Prisma.Sql {
  return Prisma.sql`
    SELECT t.id
    FROM \`Thread\` t
    JOIN \`Board\` b ON b.tokenId = t.tokenId
    WHERE t.tokenId = ${tokenId}
      AND (t.deleted = 0 OR t.commentCount > 0)
    ORDER BY (t.score / POW(10, b.decimals))
             / POW(TIMESTAMPDIFF(SECOND, t.createdAt, NOW(3)) / 3600 + 2, 1.5) DESC,
             t.createdAt DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
