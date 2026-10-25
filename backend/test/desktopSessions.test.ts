import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { mcpPrisma } from '@/prismaClient';
import { hashPassword } from '@/utils/auth';
import { DESKTOP_SESSION_DAYS } from '@/routes/desktopSessions';

const app = createApp();
const username = `desktop_${randomUUID()}`;
const password = 'Desktop-fixture-password!';
const login = () => request(app).post('/api/auth/desktop/login').send({ username, password });
const refresh = (refreshToken: string) =>
  request(app).post('/api/auth/desktop/refresh').send({ refreshToken });
beforeAll(async () => {
  await mcpPrisma.user.create({
    data: {
      username,
      role: 'reader',
      password_hash: await hashPassword(password),
      last_password_change: '2026-01-01T00:00:00.000Z'
    }
  });
});
afterAll(async () => {
  await mcpPrisma.user.deleteMany({ where: { username } });
});

describe('Remembered desktop login sessions', () => {
  it('validates input and rejects incorrect passwords without issuing a session', async () => {
    expect(
      (await request(app).post('/api/auth/desktop/login').send({ username, password: {} })).status
    ).toBe(400);
    expect(
      (await request(app).post('/api/auth/desktop/login').send({ username, password: 'wrong' }))
        .status
    ).toBe(401);
    expect((await refresh('invalid')).status).toBe(400);
  });
  it('stores only a hash and restores a short-lived access token within the fixed 90-day lifetime', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const token = response.body.refreshToken as string;
    expect(token).toMatch(/^tfds_[a-f0-9]{96}$/);
    const stored = await mcpPrisma.desktopSession.findFirstOrThrow({
      where: { ownerUsername: username },
      orderBy: { createdAt: 'desc' }
    });
    expect(stored.tokenSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      (DESKTOP_SESSION_DAYS - 1) * 86400_000
    );
    const restored = await refresh(token);
    expect(restored.status).toBe(200);
    expect(restored.body.token).toBeTruthy();
    expect(restored.body.refreshToken).toBeUndefined();
    expect(restored.body.expires_in).toBeLessThan(DESKTOP_SESSION_DAYS * 86400);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status
    ).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${restored.body.token}`))
        .status
    ).toBe(200);
    const expiry = (await mcpPrisma.desktopSession.findUniqueOrThrow({ where: { id: stored.id } }))
      .expiresAt;
    expect(expiry).toEqual(stored.expiresAt);
  });
  it('revokes the login session idempotently without revoking MCP credentials', async () => {
    const token = (await login()).body.refreshToken;
    const before = await mcpPrisma.mcpConnection.count({ where: { ownerUsername: username } });
    for (let index = 0; index < 2; index++) {
      expect(
        (await request(app).post('/api/auth/desktop/logout').send({ refreshToken: token })).status
      ).toBe(204);
    }
    expect((await refresh(token)).status).toBe(401);
    expect(await mcpPrisma.mcpConnection.count({ where: { ownerUsername: username } })).toBe(
      before
    );
  });
  it('checks expiry, account status, current role and password version on restore', async () => {
    const token = (await login()).body.refreshToken;
    await mcpPrisma.user.update({ where: { username }, data: { role: 'editor' } });
    expect((await refresh(token)).body.user.role).toBe('editor');
    await mcpPrisma.user.update({ where: { username }, data: { enabled: false } });
    expect((await refresh(token)).status).toBe(401);
    await mcpPrisma.user.update({
      where: { username },
      data: { enabled: true, last_password_change: '2026-02-01T00:00:00.000Z' }
    });
    expect((await refresh(token)).status).toBe(401);
    const fresh = (await login()).body.refreshToken;
    await mcpPrisma.desktopSession.updateMany({
      where: { ownerUsername: username },
      data: { expiresAt: new Date(0) }
    });
    expect((await refresh(fresh)).status).toBe(401);
    await mcpPrisma.user.delete({ where: { username } });
    expect((await refresh(fresh)).status).toBe(401);
  });
});
