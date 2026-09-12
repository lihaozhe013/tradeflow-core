import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { publicAgent, authAgent } from '@/test/helpers/request';

const DISABLED_USER = 'auth_disabled_test_user';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      username: DISABLED_USER,
      password_hash: 'x',
      role: 'reader',
      enabled: false
    }
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { username: DISABLED_USER } }).catch(() => undefined);
});

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and returns a token', async () => {
    const res = await publicAgent().post('/api/auth/login').send({
      username: 'test_editor',
      password: 'testpass123'
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(res.body.expires_in).toBeGreaterThan(0);
    expect(res.body.user).toMatchObject({
      username: 'test_editor',
      role: 'editor'
    });
  });

  it('rejects an incorrect password', async () => {
    const res = await publicAgent().post('/api/auth/login').send({
      username: 'test_editor',
      password: 'wrong-password'
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a disabled user', async () => {
    const res = await publicAgent().post('/api/auth/login').send({
      username: DISABLED_USER,
      password: 'whatever'
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when username or password is missing', async () => {
    const missingPassword = await publicAgent().post('/api/auth/login').send({
      username: 'test_editor'
    });
    expect(missingPassword.status).toBe(400);

    const missingUsername = await publicAgent().post('/api/auth/login').send({
      password: 'testpass123'
    });
    expect(missingUsername.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current authenticated user', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({
      username: 'test_editor',
      role: 'editor'
    });
  });

  it('requires authentication', async () => {
    const res = await publicAgent().get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns success', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Authorization middleware', () => {
  it('rejects requests without a token on protected routes', async () => {
    const res = await publicAgent().get('/api/partners?page=1&limit=5');
    expect(res.status).toBe(401);
  });

  it('rejects a reader performing a write operation', async () => {
    const agent = await authAgent('reader');
    const res = await agent.post('/api/partners').send({
      code: 'X',
      short_name: 'X'
    });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('READ_ONLY_ACCESS_DENIED');
  });

  it('blocks a reader from editor-only overview pages', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/overview/stats');
    expect(res.status).toBe(403);
  });

  it('accepts a tampered/expired token as unauthorized', async () => {
    const res = await publicAgent()
      .get('/api/partners?page=1&limit=5')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });
});
