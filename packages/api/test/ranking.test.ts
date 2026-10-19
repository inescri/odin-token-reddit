import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { hasDatabase, testApp } from './helpers/app.js';
import { ALICE, resetDb, testPrisma } from './helpers/db.js';

describe.skipIf(!hasDatabase)('ranking (MySQL)', () => {
  const prisma = testPrisma();
  const app = testApp(prisma);
  const hours = (h: number) => new Date(Date.now() - h * 3600_000);

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.board.create({ data: { tokenId: 'tok', divisibility: 8, decimals: 3 } });
    // title: score (display units), age
    const seed: Array<[string, string, number]> = [
      ['old-high', '1000', 48],
      ['fresh-mid', '100', 1],
      ['mid-mid', '300', 12],
      ['new-zero', '0', 0.1],
      ['neg', '-50', 2],
    ];
    for (const [title, score, age] of seed) {
      await prisma.thread.create({
        data: { tokenId: 'tok', author: ALICE, title, body: '', createdAt: hours(age), score: new Prisma.Decimal(score).mul(new Prisma.Decimal(10).pow(3)) },
      });
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const titles = async (sort: string) => (await request(app).get(`/boards/tok/threads?sort=${sort}`)).body.items.map((t: { title: string }) => t.title);

  it('top orders by score desc', async () => {
    expect(await titles('top')).toEqual(['old-high', 'mid-mid', 'fresh-mid', 'new-zero', 'neg']);
  });
  it('new orders by createdAt desc', async () => {
    expect(await titles('new')).toEqual(['new-zero', 'fresh-mid', 'neg', 'mid-mid', 'old-high']);
  });
  it('hot decays old scores: fresh-mid beats old-high; order matches the formula', async () => {
    const hot = (score: number, age: number) => (score >= 0 ? score / Math.pow(age + 2, 1.5) : score * Math.pow(age + 2, 1.5));
    const expected = [
      ['old-high', hot(1000, 48)], ['fresh-mid', hot(100, 1)], ['mid-mid', hot(300, 12)], ['new-zero', hot(0, 0.1)], ['neg', hot(-50, 2)],
    ].sort((a, b) => (b[1] as number) - (a[1] as number)).map((x) => x[0]);
    expect(await titles('hot')).toEqual(expected);
    expect((await titles('hot')).indexOf('fresh-mid')).toBeLessThan((await titles('hot')).indexOf('old-high'));
  });
  it('hot sinks older negative threads below newer ones', async () => {
    await prisma.thread.create({
      data: { tokenId: 'tok', author: ALICE, title: 'old-neg', body: '', createdAt: hours(100), score: new Prisma.Decimal(-50).mul(new Prisma.Decimal(10).pow(3)) },
    });
    const hot = await titles('hot');
    expect(hot.indexOf('neg')).toBeLessThan(hot.indexOf('old-neg'));
    expect(hot.at(-1)).toBe('old-neg');
  });
  it('comments: top then new', async () => {
    const t = await prisma.thread.findFirstOrThrow({ where: { title: 'fresh-mid' } });
    await prisma.comment.create({ data: { threadId: t.id, author: ALICE, body: 'low', score: new Prisma.Decimal(1), createdAt: hours(1) } });
    await prisma.comment.create({ data: { threadId: t.id, author: ALICE, body: 'high', score: new Prisma.Decimal(5), createdAt: hours(2) } });
    const top = (await request(app).get(`/threads/${t.id}/comments?sort=top`)).body.items.map((c: { body: string }) => c.body);
    const recent = (await request(app).get(`/threads/${t.id}/comments?sort=new`)).body.items.map((c: { body: string }) => c.body);
    expect(top).toEqual(['high', 'low']);
    expect(recent).toEqual(['low', 'high']);
  });
});
