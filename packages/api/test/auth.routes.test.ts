import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { testApp } from './helpers/app.js';
import { makeUser, signLogin } from './helpers/odin-identity.js';

// Auth routes touch no database; a stub client is enough.
const app = testApp({} as PrismaClient);

describe('auth routes', () => {
  it('logs in and reads /auth/me', async () => {
    const user = await makeUser();
    const login = await request(app).post('/auth/login').send(await signLogin(user));
    expect(login.status).toBe(200);
    expect(login.body.principal).toBe(user.principal);
    expect(typeof login.body.token).toBe('string');

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ principal: user.principal });
  });

  it('replaying the same login body is rejected', async () => {
    const user = await makeUser();
    const body = await signLogin(user);
    expect((await request(app).post('/auth/login').send(body)).status).toBe(200);
    const again = await request(app).post('/auth/login').send(body);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REPLAY');
  });

  it('bad bodies and bad signatures map to error codes', async () => {
    const bad = await request(app).post('/auth/login').send({ delegation: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_INPUT');

    const user = await makeUser();
    const body = await signLogin(user);
    body.signature = Buffer.from('nonsense-signature-bytes').toString('base64');
    const rejected = await request(app).post('/auth/login').send(body);
    expect(rejected.status).toBe(401);
    expect(rejected.body.error.code).toBe('LOGIN_REJECTED');
  });

  it('/auth/me without a session is 401; unknown routes are 404', async () => {
    expect((await request(app).get('/auth/me')).status).toBe(401);
    expect((await request(app).get('/nope')).status).toBe(404);
    expect((await request(app).get('/health')).body).toEqual({ ok: true });
  });
});
