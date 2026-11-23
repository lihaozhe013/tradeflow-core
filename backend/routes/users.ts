import { Hono } from 'hono';
import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import { authorize, hashPassword, signToken, verifyPassword } from '@/utils/auth';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

const USER_ROLES = ['reader', 'editor', 'superuser'] as const;

/**
 * PUT /api/users/me
 * Update current user's display name. Any logged-in user can do this.
 */
app.put('/me', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { display_name } = body ?? {};

  if (display_name === undefined) {
    return c.json({ success: false, message: 'Missing display_name field' }, 400);
  }

  if (display_name !== null && typeof display_name !== 'string') {
    return c.json({ success: false, message: 'Display name must be a string' }, 400);
  }

  const user = c.get('user')!;
  const updated = await prisma.user.update({
    where: { username: user.username },
    data: { display_name }
  });

  const { password_hash: _, ...safeUser } = updated;
  return c.json({ success: true, data: safeUser });
});

/**
 * PUT /api/users/me/password
 * Change current user's password. Requires old password verification.
 */
app.put('/me/password', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { oldPassword, newPassword } = body ?? {};

  if (
    typeof oldPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    !oldPassword ||
    !newPassword
  ) {
    return c.json(
      {
        success: false,
        message: 'Missing oldPassword or newPassword'
      },
      400
    );
  }

  if (newPassword.length < 6) {
    return c.json(
      {
        success: false,
        message: 'New password must be at least 6 characters'
      },
      400
    );
  }

  const currentUser = c.get('user')!;
  const user = await prisma.user.findUnique({
    where: { username: currentUser.username }
  });

  if (!user) {
    return c.json({ success: false, message: 'User not found' }, 404);
  }

  const valid = await verifyPassword(oldPassword, user.password_hash);
  if (!valid) {
    return c.json({ success: false, message: 'Old password is incorrect' }, 401);
  }

  const hash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { username: currentUser.username },
    data: {
      password_hash: hash,
      last_password_change: new Date().toISOString()
    }
  });

  const { token, expires_in } = signToken(updated);
  return c.json({ success: true, message: 'Password updated', token, expires_in });
});

/**
 * POST /api/users
 * Create a user. Superuser only.
 */
app.post('/', authorize(['superuser']), async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName = body.display_name;
  const role = body.role === undefined ? 'reader' : body.role;
  const enabled = body.enabled === undefined ? true : body.enabled;

  if (!username) {
    return c.json({ success: false, message: 'Username is required' }, 400);
  }

  if (password.length < 6) {
    return c.json(
      {
        success: false,
        message: 'Password must be at least 6 characters'
      },
      400
    );
  }

  if (typeof role !== 'string' || !USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
    return c.json({ success: false, message: 'Invalid user role' }, 400);
  }

  if (displayName !== undefined && displayName !== null && typeof displayName !== 'string') {
    return c.json({ success: false, message: 'Display name must be a string' }, 400);
  }

  if (typeof enabled !== 'boolean') {
    return c.json({ success: false, message: 'Enabled must be a boolean' }, 400);
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
        last_password_change: new Date().toISOString()
      }
    });

    const { password_hash: _, ...safeUser } = created;
    return c.json({ success: true, data: safeUser }, 201);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return c.json(
        {
          success: false,
          message: 'Username already exists'
        },
        409
      );
    }

    throw error;
  }
});

/**
 * GET /api/users
 * List all users with pagination. Superuser only.
 */
app.get('/', authorize(['superuser']), async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20));
  const skip = (page - 1) * pageSize;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { username: 'asc' },
      skip,
      take: pageSize
    }),
    prisma.user.count()
  ]);

  const safeUsers = users.map((u) => {
    const { password_hash, ...rest } = u;
    return rest;
  });

  return c.json({
    success: true,
    data: {
      items: safeUsers,
      total,
      page,
      pageSize
    }
  });
});

/**
 * PUT /api/users/:username
 * Update user details (display_name, role, enabled). Superuser only.
 */
app.put('/:username', authorize(['superuser']), async (c) => {
  const username = c.req.param('username');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { role, display_name, enabled } = body;

  if (!username) {
    return c.json({ success: false, message: 'Username is required' }, 400);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    return c.json({ success: false, message: 'User not found' }, 404);
  }

  const data: Prisma.UserUpdateInput = {};
  if (role !== undefined) data.role = role;
  if (display_name !== undefined) data.display_name = display_name;
  if (enabled !== undefined) data.enabled = enabled;

  const updated = await prisma.user.update({
    where: { username },
    data
  });

  const { password_hash: _, ...safeUser } = updated;
  return c.json({ success: true, data: safeUser });
});

/**
 * PUT /api/users/:username/reset-password
 * Superuser resets another user's password without needing old password.
 */
app.put('/:username/reset-password', authorize(['superuser']), async (c) => {
  const username = c.req.param('username');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { newPassword } = body;

  if (!username) {
    return c.json({ success: false, message: 'Username is required' }, 400);
  }

  if (!newPassword || newPassword.length < 6) {
    return c.json(
      {
        success: false,
        message: 'New password must be at least 6 characters'
      },
      400
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    return c.json({ success: false, message: 'User not found' }, 404);
  }

  const hash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { username },
    data: {
      password_hash: hash,
      last_password_change: new Date().toISOString()
    }
  });

  return c.json({ success: true, message: 'Password reset successfully' });
});

/**
 * DELETE /api/users/:username
 * Delete a user. Superuser only. Cannot delete self.
 */
app.delete('/:username', authorize(['superuser']), async (c) => {
  const username = c.req.param('username');
  const currentUser = c.get('user');

  if (!username) {
    return c.json({ success: false, message: 'Username is required' }, 400);
  }

  if (currentUser?.username === username) {
    return c.json({ success: false, message: 'Cannot delete yourself' }, 400);
  }

  await prisma.user.delete({ where: { username } });
  return c.json({ success: true, message: 'User deleted' });
});

export default app;
