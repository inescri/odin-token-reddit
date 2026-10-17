import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { hasDatabase, testApp } from './helpers/app.js';
import { ALICE, BOB, TOKEN, authFor, resetDb, testPrisma } from './helpers/db.js';

describe.skipIf(!hasDatabase)('votes (MySQL)', () => {
  const prisma = testPrisma();
  const app = testApp(prisma);
  let alice: string;
  let bob: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb(prisma);
    alice = await authFor(ALICE);
    bob = await authFor(BOB);
    const t = await request(app).post('/boards/2jjj/threads').set('Authorization', alice).send({ title: 'T', body: '', token: TOKEN });
    threadId = t.body.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const vote = (auth: string, direction: 'up' | 'down', weight: string, kind: 'thread' | 'comment' = 'thread', id = threadId) =>
    request(app).post('/votes').set('Authorization', auth).send({ target: { kind, id }, direction, weight });

  it('cast, retract, flip with two voters; weights frozen; retract uses stored weight', async () => {
    const a = await vote(alice, 'up', '1000');
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ score: '1000', upCount: 1, downCount: 0, myVote: 'up', appliedWeight: '1000' });

    const b = await vote(bob, 'up', '250');
    expect(b.body).toMatchObject({ score: '1250', upCount: 2, downCount: 0 });

    // Alice "sold everything": retract with weight 0 still removes her stored 1000.
    const retract = await vote(alice, 'up', '0');
    expect(retract.body).toMatchObject({ score: '250', upCount: 1, downCount: 0, myVote: null, appliedWeight: '0' });

    // Flip bob: remove stored 250, add fresh 300 down.
    const flip = await vote(bob, 'down', '300');
    expect(flip.body).toMatchObject({ score: '-300', upCount: 0, downCount: 1, myVote: 'down', appliedWeight: '300' });

    const thread = await request(app).get(`/threads/${threadId}`).set('Authorization', bob);
    expect(thread.body).toMatchObject({ score: '-300', upCount: 0, downCount: 1, myVote: 'down' });
    const anon = await request(app).get(`/threads/${threadId}`);
    expect(anon.body.myVote).toBeNull();
  });

  it('refuses zero-weight cast and flip, deleted targets, bad weights, and anonymous voters', async () => {
    expect((await vote(alice, 'up', '0')).body.error.code).toBe('NO_BALANCE');
    await vote(alice, 'up', '5');
    expect((await vote(alice, 'down', '0')).body.error.code).toBe('NO_BALANCE');
    expect((await vote(alice, 'up', '-1')).body.error.code).toBe('INVALID_INPUT');
    expect((await vote(alice, 'up', '1.5')).body.error.code).toBe('INVALID_INPUT');
    expect((await vote(alice, 'up', '1'.repeat(41))).body.error.code).toBe('INVALID_INPUT');
    expect((await request(app).post('/votes').send({ target: { kind: 'thread', id: threadId }, direction: 'up', weight: '1' })).status).toBe(401);
    expect((await vote(alice, 'up', '1', 'thread', '987654')).status).toBe(404);

    const c = await request(app).post(`/threads/${threadId}/comments`).set('Authorization', bob).send({ body: 'c' });
    expect((await vote(alice, 'up', '7', 'comment', c.body.id)).body).toMatchObject({ score: '7', upCount: 1 });
    await request(app).delete(`/comments/${c.body.id}`).set('Authorization', bob);
    expect((await vote(alice, 'up', '7', 'comment', c.body.id)).body.error.code).toBe('DELETED');
  });

  it('100 concurrent alternating toggles converge to ≤1 vote and consistent counters (SC-003)', async () => {
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => vote(alice, i % 2 === 0 ? 'up' : 'down', '10')));
    for (const r of results) expect(r.status).toBe(200);

    const votes = await prisma.vote.findMany({ where: { voter: ALICE } });
    expect(votes.length).toBeLessThanOrEqual(1);
    const t = await prisma.thread.findUniqueOrThrow({ where: { id: BigInt(threadId) } });
    expect(t.upCount).toBeGreaterThanOrEqual(0);
    expect(t.downCount).toBeGreaterThanOrEqual(0);
    expect(t.upCount + t.downCount).toBe(votes.length);
    const expectedScore = votes.reduce((acc, v) => acc + (v.direction === 'UP' ? 1n : -1n) * BigInt(v.weight.toString()), 0n);
    expect(BigInt(t.score.toString())).toBe(expectedScore);
  });

  it('two sessions for one principal see the same myVote', async () => {
    await vote(alice, 'up', '9');
    const alice2 = await authFor(ALICE);
    expect((await request(app).get(`/threads/${threadId}`).set('Authorization', alice2)).body.myVote).toBe('up');
    expect((await request(app).get('/boards/2jjj/threads').set('Authorization', alice2)).body.items[0].myVote).toBe('up');
  });
});
