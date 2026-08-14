import express, { type Router, type Request, type Response } from 'express';
import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import { authorize, hashPassword, verifyPassword } from '@/utils/auth';

const router: Router = express.Router();

const USER_ROLES = ['reader', 'editor', 'superuser'] as const;

/**
 * PUT /api/users/me
 * Update current user's display name. Any logged-in user can do this.
 */
router.put('/me', async (req: Request, res: Response): Promise<void> => {
  const { display_name } = req.body;

  if (display_name === undefined) {
    res
      .status(400)
      .json({ success: false, message: 'Missing display_name field' });
    return;
  }

  const updated = await prisma.user.update({
    where: { username: req.user!.username },
    data: { display_name },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash: _, ...safeUser } = updated;
  res.json({ success: true, data: safeUser });
});

/**
 * PUT /api/users/me/password
 * Change current user's password. Requires old password verification.
 */
router.put(
  '/me/password',
  async (req: Request, res: Response): Promise<void> => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Missing oldPassword or newPassword',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { username: req.user!.username },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) {
      res
        .status(401)
        .json({ success: false, message: 'Old password is incorrect' });
      return;
    }

    const hash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { username: req.user!.username },
      data: {
        password_hash: hash,
        last_password_change: new Date().toISOString(),
      },
    });

    res.json({ success: true, message: 'Password updated' });
  },
);

/**
 * POST /api/users
 * Create a user. Superuser only.
 */
router.post(
  '/',
  authorize(['superuser']),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const username =
      typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = body.display_name;
    const role = body.role === undefined ? 'reader' : body.role;
    const enabled = body.enabled === undefined ? true : body.enabled;

    if (!username) {
      res.status(400).json({ success: false, message: 'Username is required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
      return;
    }

    if (
      typeof role !== 'string' ||
      !USER_ROLES.includes(role as (typeof USER_ROLES)[number])
    ) {
      res.status(400).json({ success: false, message: 'Invalid user role' });
      return;
    }

    if (
      displayName !== undefined &&
      displayName !== null &&
      typeof displayName !== 'string'
    ) {
      res
        .status(400)
        .json({ success: false, message: 'Display name must be a string' });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res
        .status(400)
        .json({ success: false, message: 'Enabled must be a boolean' });
      return;
    }

    const passwordHash = await hashPassword(password);

    try {
      const created = await prisma.user.create({
        data: {
          username,
          password_hash: passwordHash,
          role,
          display_name: displayName,
          enabled,
          last_password_change: new Date().toISOString(),
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash: _, ...safeUser } = created;
      res.status(201).json({ success: true, data: safeUser });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        res.status(409).json({
          success: false,
          message: 'Username already exists',
        });
        return;
      }

      throw error;
    }
  },
);

/**
 * GET /api/users
 * List all users with pagination. Superuser only.
 */
router.get(
  '/',
  authorize(['superuser']),
  async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query['pageSize']) || 20),
    );
    const skip = (page - 1) * pageSize;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { username: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.user.count(),
    ]);

    const safeUsers = users.map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...rest } = u;
      return rest;
    });

    res.json({
      success: true,
      data: {
        items: safeUsers,
        total,
        page,
        pageSize,
      },
    });
  },
);

/**
 * PUT /api/users/:username
 * Update user details (display_name, role, enabled). Superuser only.
 */
router.put(
  '/:username',
  authorize(['superuser']),
  async (req: Request, res: Response): Promise<void> => {
    const username = req.params['username'] as string;
    const { role, display_name, enabled } = req.body;

    if (!username) {
      res.status(400).json({ success: false, message: 'Username is required' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const data: Prisma.UserUpdateInput = {};
    if (role !== undefined) data.role = role;
    if (display_name !== undefined) data.display_name = display_name;
    if (enabled !== undefined) data.enabled = enabled;

    const updated = await prisma.user.update({
      where: { username },
      data,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash: _, ...safeUser } = updated;
    res.json({ success: true, data: safeUser });
  },
);

/**
 * PUT /api/users/:username/reset-password
 * Superuser resets another user's password without needing old password.
 */
router.put(
  '/:username/reset-password',
  authorize(['superuser']),
  async (req: Request, res: Response): Promise<void> => {
    const username = req.params['username'] as string;
    const { newPassword } = req.body;

    if (!username) {
      res.status(400).json({ success: false, message: 'Username is required' });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const hash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { username },
      data: {
        password_hash: hash,
        last_password_change: new Date().toISOString(),
      },
    });

    res.json({ success: true, message: 'Password reset successfully' });
  },
);

/**
 * DELETE /api/users/:username
 * Delete a user. Superuser only. Cannot delete self.
 */
router.delete(
  '/:username',
  authorize(['superuser']),
  async (req: Request, res: Response): Promise<void> => {
    const username = req.params['username'] as string;

    if (!username) {
      res.status(400).json({ success: false, message: 'Username is required' });
      return;
    }

    if (req.user?.username === username) {
      res
        .status(400)
        .json({ success: false, message: 'Cannot delete yourself' });
      return;
    }

    await prisma.user.delete({ where: { username } });
    res.json({ success: true, message: 'User deleted' });
  },
);

export default router;
