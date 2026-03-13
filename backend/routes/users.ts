import express, { type Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '@/prismaClient';
import { authorize, hashPassword } from '@/utils/auth';

const router: Router = express.Router();

/**
 * GET /api/users
 * List all users. Only 'editor' or admins can view.
 */

router.get('/', authorize(['editor']), async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
  });
  // Strip hash before returning
  const safeUsers = users.map((u) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...rest } = u;
    return rest;
  });
  res.json(safeUsers);
});

/**
 * POST /api/users
 * Create a new user.
 */
router.post('/', authorize(['editor']), async (req: Request, res: Response): Promise<void> => {
  const { username, password, role, display_name } = req.body;

  if (!username || !password || !role) {
    res.status(400).json({ success: false, message: 'Missing required fields' });
    return;
  }

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ success: false, message: 'Username already exists' });
    return;
  }

  const hash = await hashPassword(password);
  const newUser = await prisma.user.create({
    data: {
      username,
      password_hash: hash,
      role,
      display_name,
      enabled: true,
      last_password_change: new Date().toISOString(),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash: _, ...safeUser } = newUser;
  res.status(201).json({ success: true, data: safeUser });
});

/**
 * PUT /api/users/:username
 * Update user details.
 */
router.put(
  '/:username',
  authorize(['editor']),
  async (req: Request, res: Response): Promise<void> => {
    const username = req.params['username'] as string;
    const { password, role, display_name, enabled } = req.body;

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

    if (password) {
      data.password_hash = await hashPassword(password);
      data.last_password_change = new Date().toISOString();
    }

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
 * DELETE /api/users/:username
 * Delete a user.
 */
router.delete(
  '/:username',
  authorize(['editor']),
  async (req: Request, res: Response): Promise<void> => {
    const username = req.params['username'] as string;

    if (!username) {
      res.status(400).json({ success: false, message: 'Username is required' });
      return;
    }

    // Prevent deleting self? Maybe.
    if (req.user?.username === username) {
      res.status(400).json({ success: false, message: 'Cannot delete yourself' });
      return;
    }

    await prisma.user.delete({ where: { username } });
    res.json({ success: true, message: 'User deleted' });
  },
);

export default router;
