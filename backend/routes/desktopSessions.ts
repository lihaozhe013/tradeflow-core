import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { mcpPrisma } from '@/prismaClient';
import {
  findUser,
  getAuthConfig,
  getPublicUser,
  loginRateLimiter,
  signToken,
  verifyPassword
} from '@/utils/auth';
import type { AppEnv } from '@/types/hono';

export const DESKTOP_SESSION_DAYS = 90;
const credentials = z
  .object({
    username: z.string().trim().min(1).max(256),
    password: z.string().min(1).max(4096)
  })
  .strict();
const refreshBody = z.object({ refreshToken: z.string().regex(/^tfds_[a-f0-9]{96}$/) }).strict();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!getAuthConfig().enabled) {
    return c.json({ success: false, code: 'AUTH_DISABLED' }, 409);
  }
  return await next();
});

// Refresh is credential authentication too; keep unauthenticated requests rate-limited.
app.post('/login', loginRateLimiter, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, code: 'INVALID_LOGIN_REQUEST' }, 400);
  }

  const parsed = credentials.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: 'INVALID_LOGIN_REQUEST' }, 400);
  }
  const user = await findUser(parsed.data.username);
  if (!user || !user.enabled || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return c.json({ success: false, code: 'LOGIN_FAILED' }, 401);
  }
  const refreshToken = `tfds_${randomBytes(48).toString('hex')}`;
  const expiresAt = new Date(Date.now() + DESKTOP_SESSION_DAYS * 86400_000);
  await mcpPrisma.desktopSession.deleteMany({
    where: { ownerUsername: user.username, expiresAt: { lte: new Date() } }
  });
  await mcpPrisma.desktopSession.create({
    data: {
      ownerUsername: user.username,
      tokenSha256: hash(refreshToken),
      passwordVersion: user.last_password_change,
      expiresAt
    }
  });
  return c.json({
    success: true,
    ...signToken(user),
    user: getPublicUser(user),
    refreshToken,
    refreshExpiresAt: expiresAt.toISOString()
  });
});

app.post('/refresh', loginRateLimiter, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, code: 'INVALID_SESSION_REQUEST' }, 400);
  }

  const parsed = refreshBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: 'INVALID_SESSION_REQUEST' }, 400);
  }
  const session = await mcpPrisma.desktopSession.findUnique({
    where: { tokenSha256: hash(parsed.data.refreshToken) },
    include: { owner: true }
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.owner.enabled ||
    session.passwordVersion !== session.owner.last_password_change
  ) {
    return c.json({ success: false, code: 'SESSION_EXPIRED' }, 401);
  }
  // A refresh token is accepted only here and at logout, never as an API or MCP bearer token.
  return c.json({ success: true, ...signToken(session.owner), user: getPublicUser(session.owner) });
});

app.post('/logout', loginRateLimiter, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, code: 'INVALID_SESSION_REQUEST' }, 400);
  }

  const parsed = refreshBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: 'INVALID_SESSION_REQUEST' }, 400);
  }
  await mcpPrisma.desktopSession.updateMany({
    where: { tokenSha256: hash(parsed.data.refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return c.body(null, 204);
});

export default app;
