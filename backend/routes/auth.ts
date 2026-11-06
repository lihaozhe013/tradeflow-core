import { Hono } from 'hono';
import {
  findUser,
  verifyPassword,
  signToken,
  getPublicUser,
  authenticateToken,
  loginRateLimiter
} from '@/utils/auth';
import { logger } from '@/utils/logger';
import desktopSessions from '@/routes/desktopSessions';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

app.route('/desktop', desktopSessions);

/**
 * POST /api/auth/login
 */
app.post('/login', loginRateLimiter, async (c) => {
  let body: { username?: string; password?: string } | undefined;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, message: 'Incorrect username or password!' }, 400);
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return c.json({ success: false, message: 'Incorrect username or password!' }, 400);
  }

  const user = await findUser(username);
  if (!user || user.enabled === false || !user.password_hash) {
    return c.json({ success: false, message: 'Incorrect username or password!' }, 401);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return c.json({ success: false, message: 'Incorrect username or password!' }, 401);
  }

  const { token, expires_in } = signToken(user);

  logger.info('User login success', {
    username: user.username,
    role: user.role
  });
  return c.json({
    success: true,
    token,
    expires_in,
    user: getPublicUser(user)
  });
});

/**
 * GET /api/auth/me
 */
app.get('/me', authenticateToken, (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  return c.json({
    success: true,
    user: {
      username: user.username,
      role: user.role,
      display_name: user.name
    }
  });
});

/**
 * POST /api/auth/logout
 * User logout (stateless JWT; simply delete the token will be fine)
 */
app.post('/logout', (c) => {
  return c.json({ success: true });
});

export default app;
