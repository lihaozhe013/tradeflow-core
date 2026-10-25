import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
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

export const DESKTOP_SESSION_DAYS = 90;
const credentials = z
  .object({
    username: z.string().trim().min(1).max(256),
    password: z.string().min(1).max(4096)
  })
  .strict();
const refreshBody = z.object({ refreshToken: z.string().regex(/^tfds_[a-f0-9]{96}$/) }).strict();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const router = Router();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!getAuthConfig().enabled) {
    res.status(409).json({ success: false, code: 'AUTH_DISABLED' });
    return;
  }
  next();
});
// Refresh is credential authentication too; keep unauthenticated requests rate-limited.
router.post('/login', loginRateLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, code: 'INVALID_LOGIN_REQUEST' });
    return;
  }
  const user = await findUser(parsed.data.username);
  if (!user || !user.enabled || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    res.status(401).json({ success: false, code: 'LOGIN_FAILED' });
    return;
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
  res.json({
    success: true,
    ...signToken(user),
    user: getPublicUser(user),
    refreshToken,
    refreshExpiresAt: expiresAt.toISOString()
  });
});
router.post('/refresh', loginRateLimiter, async (req, res) => {
  const parsed = refreshBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, code: 'INVALID_SESSION_REQUEST' });
    return;
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
    res.status(401).json({ success: false, code: 'SESSION_EXPIRED' });
    return;
  }
  // A refresh token is accepted only here and at logout, never as an API or MCP bearer token.
  res.json({ success: true, ...signToken(session.owner), user: getPublicUser(session.owner) });
});
router.post('/logout', loginRateLimiter, async (req, res) => {
  const parsed = refreshBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, code: 'INVALID_SESSION_REQUEST' });
    return;
  }
  await mcpPrisma.desktopSession.updateMany({
    where: { tokenSha256: hash(parsed.data.refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
  res.sendStatus(204);
});
export default router;
