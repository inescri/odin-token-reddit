import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { hasDatabase, testApp } from './helpers/app.js';
import { ALICE, BOB, TOKEN, authFor, resetDb, testPrisma } from './helpers/db.js';

describe.skipIf(!hasDatabase)('threads & comments routes (MySQL)', () => {
  const prisma = testPrisma();
  const app = testApp(prisma);
  let alice: string;
  let bob: string;

  beforeEach(async () => {
    await resetDb(prisma);
    alice = await authFor(ALICE);
    bob = await authFor(BOB);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createThread = (auth: string, title = 'Hello', body = 'World') =>
    request(app).post('/boards/2jjj/threads').set('Authorization', auth).send({ title, body, token: TOKEN });

  it('creates, lists (New), reads, edits, deletes a thread with author checks', async () => {
    const created = await createThread(alice);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ tokenId: '2jjj', author: ALICE, title: 'Hello', body: 'World', score: '0', upCount: 0, downCount: 0, commentCount: 0, deleted: false, myVote: null });

    const list = await request(app).get('/boards/2jjj/threads?sort=new');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(created.body.id);

    const anon = await request(app).get(`/threads/${created.body.id}`);
    expect(anon.status).toBe(200);
    expect(anon.body.myVote).toBeNull();

    const forbidden = await request(app).patch(`/threads/${created.body.id}`).set('Authorization', bob).send({ title: 'Hijack', body: '' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const edited = await request(app).patch(`/threads/${created.body.id}`).set('Authorization', alice).send({ title: 'Edited', body: 'New body' });
    expect(edited.status).toBe(200);
    expect(edited.body.title).toBe('Edited');
    expect(edited.body.editedAt).not.toBeNull();

    const del = await request(app).delete(`/threads/${created.body.id}`).set('Authorization', alice);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/threads/${created.body.id}`);
    expect(after.body).toMatchObject({ deleted: true, title: '', body: '' });
    // Deleted with no comments → hidden from the board list.
    expect((await request(app).get('/boards/2jjj/threads')).body.total).toBe(0);
  });

  it('validates input and requires sign-in for writes', async () => {
    expect((await createThread(alice, '   ')).body.error.code).toBe('INVALID_INPUT');
    expect((await createThread(alice, 'x'.repeat(201))).body.error.code).toBe('INVALID_INPUT');
    const noAuth = await request(app).post('/boards/2jjj/threads').send({ title: 'x', token: TOKEN });
    expect(noAuth.status).toBe(401);
    expect((await request(app).get('/threads/999999')).status).toBe(404);
    expect((await request(app).get('/boards/2jjj/threads?sort=weird')).status).toBe(400);
  });

  it('nests comments, preserves replies under a deleted comment, enforces thread/parent rules', async () => {
    const thread = (await createThread(alice)).body;
    const c1 = await request(app).post(`/threads/${thread.id}/comments`).set('Authorization', bob).send({ body: 'first' });
    expect(c1.status).toBe(201);
    const c2 = await request(app).post(`/threads/${thread.id}/comments`).set('Authorization', alice).send({ body: 'reply', parentId: c1.body.id });
    expect(c2.status).toBe(201);
    expect(c2.body.parentId).toBe(c1.body.id);

    expect((await request(app).get(`/threads/${thread.id}`)).body.commentCount).toBe(2);
    expect((await request(app).post(`/threads/${thread.id}/comments`).set('Authorization', alice).send({ body: ' \n ' })).body.error.code).toBe('INVALID_INPUT');
    expect((await request(app).post(`/threads/${thread.id}/comments`).set('Authorization', alice).send({ body: 'x', parentId: '424242' })).status).toBe(404);

    const del = await request(app).delete(`/comments/${c1.body.id}`).set('Authorization', bob);
    expect(del.status).toBe(204);
    const list = await request(app).get(`/threads/${thread.id}/comments`);
    const flat = list.body.items as Array<{ id: string; deleted: boolean; body: string; parentId: string | null }>;
    expect(flat.find((c) => c.id === c1.body.id)).toMatchObject({ deleted: true, body: '' });
    expect(flat.find((c) => c.id === c2.body.id)).toMatchObject({ parentId: c1.body.id, deleted: false });
    expect((await request(app).get(`/threads/${thread.id}`)).body.commentCount).toBe(1);

    const replyToDeleted = await request(app).post(`/threads/${thread.id}/comments`).set('Authorization', alice).send({ body: 'x', parentId: c1.body.id });
    expect(replyToDeleted.body.error.code).toBe('DELETED');

    await request(app).delete(`/threads/${thread.id}`).set('Authorization', alice);
    expect((await request(app).post(`/threads/${thread.id}/comments`).set('Authorization', alice).send({ body: 'x' })).body.error.code).toBe('DELETED');
    // Deleted thread with comments stays listed for permalinks.
    expect((await request(app).get('/boards/2jjj/threads')).body.total).toBe(1);
  });

  it('concurrent posts from one principal pass the cooldown exactly once', async () => {
    // The shared test app disables the cooldown; this one uses the real 30 s.
    const cooled = testApp(prisma, { POST_COOLDOWN_MS: 30_000 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      request(cooled).post('/boards/2jjj/threads').set('Authorization', alice).send({ title: `t${i}`, body: '', token: TOKEN })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 429)).toHaveLength(9);
    expect(await prisma.thread.count({ where: { author: ALICE } })).toBe(1);
  });

  it('concurrent deletes of one comment decrement commentCount once', async () => {
    const t = await createThread(alice);
    const c = await request(app).post(`/threads/${t.body.id}/comments`).set('Authorization', bob).send({ body: 'c' });
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).delete(`/comments/${c.body.id}`).set('Authorization', bob)));
    for (const r of results) expect(r.status).toBe(204);
    const thread = await prisma.thread.findUniqueOrThrow({ where: { id: BigInt(t.body.id) } });
    expect(thread.commentCount).toBe(0);
  });

  it('board stats count non-deleted threads and return zero for unknown boards', async () => {
    await createThread(alice);
    const res = await request(app).get('/boards/stats?tokenIds=2jjj,nope');
    expect(res.body.items).toEqual([
      expect.objectContaining({ tokenId: '2jjj', threadCount: 1 }),
      { tokenId: 'nope', threadCount: 0, lastActivity: null },
    ]);
  });
});
