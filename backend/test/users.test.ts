import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent, loginAgent, publicAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

const TEMP_USERS: string[] = [];

function tempUsername(): string {
  const name = `tuser_${uniqueSuffix()}`;
  TEMP_USERS.push(name);
  return name;
}

afterAll(async () => {
  for (const username of TEMP_USERS) {
    await prisma.user.delete({ where: { username } }).catch(() => undefined);
  }
});

beforeAll(async () => {
  const existing = await prisma.user.findUnique({ where: { username: 'test_superuser' } });
  if (!existing) {
    throw new Error('Seeded superuser missing');
  }
});

describe('GET /api/users (superuser only)', () => {
  it('lists users with pagination as a superuser', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.get('/api/users?page=1&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(10);

    const item = res.body.data.items[0];
    expect(item.password_hash).toBeUndefined();
  });

  it('forbids editors from listing users', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/users');
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await publicAgent().get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/users (superuser only)', () => {
  it('creates a user', async () => {
    const username = tempUsername();
    const agent = await authAgent('superuser');
    const res = await agent.post('/api/users').send({
      username,
      password: 'secret123',
      role: 'reader',
      display_name: 'Temp Reader'
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(username);
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('rejects a duplicate username with 409', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.post('/api/users').send({
      username: 'test_editor',
      password: 'secret123'
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Username already exists');
  });

  it('rejects missing username and short passwords', async () => {
    const agent = await authAgent('superuser');

    const noUsername = await agent.post('/api/users').send({ password: 'secret123' });
    expect(noUsername.status).toBe(400);

    const shortPassword = await agent
      .post('/api/users')
      .send({ username: tempUsername(), password: '123' });
    expect(shortPassword.status).toBe(400);
  });

  it('rejects an invalid role', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.post('/api/users').send({
      username: tempUsername(),
      password: 'secret123',
      role: 'admin'
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid user role');
  });

  it('forbids editors from creating users', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/users').send({
      username: tempUsername(),
      password: 'secret123'
    });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:username (superuser only)', () => {
  it('updates display name, role and enabled state', async () => {
    const username = tempUsername();
    await prisma.user.create({
      data: { username, password_hash: 'hash', role: 'reader', enabled: true }
    });

    const agent = await authAgent('superuser');
    const res = await agent.put(`/api/users/${username}`).send({
      display_name: 'Updated Name',
      role: 'editor',
      enabled: false
    });

    expect(res.status).toBe(200);
    expect(res.body.data.display_name).toBe('Updated Name');
    expect(res.body.data.role).toBe('editor');
    expect(res.body.data.enabled).toBe(false);
  });

  it('returns 404 for an unknown user', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.put(`/api/users/${tempUsername()}`).send({ display_name: 'Nobody' });
    expect(res.status).toBe(404);
  });

  it('forbids editors', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put('/api/users/test_editor').send({ display_name: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:username/reset-password (superuser only)', () => {
  it('resets another user password without the old one', async () => {
    const username = tempUsername();
    await prisma.user.create({
      data: { username, password_hash: 'hash', role: 'reader', enabled: true }
    });

    const agent = await authAgent('superuser');
    const res = await agent.put(`/api/users/${username}/reset-password`).send({
      newPassword: 'brandnew123'
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password reset successfully');
  });

  it('returns 400 for a short new password', async () => {
    const agent = await authAgent('superuser');
    const res = await agent
      .put('/api/users/test_editor/reset-password')
      .send({ newPassword: '123' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown user', async () => {
    const agent = await authAgent('superuser');
    const res = await agent
      .put(`/api/users/${tempUsername()}/reset-password`)
      .send({ newPassword: 'brandnew123' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/:username (superuser only)', () => {
  it('deletes a user', async () => {
    const username = tempUsername();
    await prisma.user.create({
      data: { username, password_hash: 'hash', role: 'reader', enabled: true }
    });

    const agent = await authAgent('superuser');
    const res = await agent.delete(`/api/users/${username}`);

    expect(res.status).toBe(200);
    const remaining = await prisma.user.findUnique({ where: { username } });
    expect(remaining).toBeNull();
  });

  it('forbids deleting yourself', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.delete('/api/users/test_superuser');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cannot delete yourself');
  });
});

describe('PUT /api/users/me (any authenticated user)', () => {
  it('updates the current user display name', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put('/api/users/me').send({ display_name: 'New Display' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.display_name).toBe('New Display');
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('returns 400 when display_name is missing', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put('/api/users/me').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when display_name is not a string', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put('/api/users/me').send({ display_name: 42 });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/users/me/password', () => {
  it('changes the password and returns a new token', async () => {
    const username = tempUsername();
    const superAgent = await authAgent('superuser');
    await superAgent.post('/api/users').send({
      username,
      password: 'original123',
      role: 'editor'
    });

    const agent = await loginAgent(username, 'original123');
    const changeRes = await agent
      .put('/api/users/me/password')
      .send({ oldPassword: 'original123', newPassword: 'changed456' });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);
    expect(typeof changeRes.body.token).toBe('string');

    const relogin = await publicAgent().post('/api/auth/login').send({
      username,
      password: 'changed456'
    });
    expect(relogin.status).toBe(200);
  });

  it('rejects an incorrect old password', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put('/api/users/me/password').send({
      oldPassword: 'wrong-old',
      newPassword: 'validnew123'
    });

    expect(res.status).toBe(401);
  });

  it('rejects a short new password', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put('/api/users/me/password').send({
      oldPassword: 'testpass123',
      newPassword: '123'
    });

    expect(res.status).toBe(400);
  });
});
