import express, { type Router, type Request, type Response } from 'express';
import {
  findUser,
  verifyPassword,
  signToken,
  getPublicUser,
  authenticateToken,
  loginRateLimiter,
} from '@/utils/auth';
import { logger } from '@/utils/logger';

const router: Router = express.Router();

/**
 * POST /api/auth/login
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<Response> => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Incorrect username or password!' });
  }

  try {
    const user = findUser(username);
    if (!user || user.enabled === false || !user.password_hash) {
      return res.status(401).json({ success: false, message: 'Incorrect username or password!' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Incorrect username or password!' });
    }

    const { token, expires_in } = signToken(user);

    logger.info('User login success', { username: user.username, role: user.role });
    return res.json({ success: true, token, expires_in, user: getPublicUser(user) });
  } catch (e) {
    const error = e as Error;
    logger.error('Login error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req: Request, res: Response): Response => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  return res.json({
    success: true,
    user: {
      username: req.user.username,
      role: req.user.role,
      display_name: req.user.name,
    },
  });
});

/**
 * POST /api/auth/logout
 * User logout (stateless JWT; simply delete the token will be fine)
 */
router.post('/logout', (_req: Request, res: Response): Response => {
  return res.json({ success: true });
});

export default router;
