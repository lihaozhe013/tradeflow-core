import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import type { Context, MiddlewareHandler } from 'hono';
import { logger } from '@/utils/logger';
import { resolveFilesInCachePath, config } from '@/utils/paths';
import { prisma } from '../prismaClient';
import type { User as DbUser } from '@/prisma/client';
import type { AppEnv } from '@/types/hono';

const secretPath: string = resolveFilesInCachePath('jwt-secret.txt');

export interface UserData {
  username: string;
  password_hash?: string;
  role: string;
  display_name?: string | null;
  enabled?: boolean;
  last_password_change?: string | null;
}

interface AuthConfig {
  enabled: boolean;
  tokenExpiresInHours: number;
  loginRateLimit: {
    windowMinutes: number;
    maxAttempts: number;
  };
  allowExportsForReader: boolean;
}

interface JWTPayload {
  sub: string;
  role: string;
  name: string;
  pwd_ver: string;
}

interface LoginAttempt {
  count: number;
  firstAt: number;
}

const READER_SELF_SERVICE_PATHS = new Set(['/api/users/me', '/api/users/me/password']);

export function getAuthConfig(): AuthConfig {
  const auth = config?.auth;
  return {
    enabled: auth?.enabled ?? false,
    tokenExpiresInHours: auth?.tokenExpiresInHours || 12,
    loginRateLimit: {
      windowMinutes: auth?.loginRateLimit?.windowMinutes || 5,
      maxAttempts: auth?.loginRateLimit?.maxAttempts || 20
    },
    allowExportsForReader:
      auth?.allowExportsForReader !== undefined ? auth.allowExportsForReader : true
  };
}

export function ensureJwtSecret(): string {
  try {
    if (!fs.existsSync(secretPath)) {
      fs.ensureDirSync(path.dirname(secretPath));
      const secret = crypto.randomBytes(64).toString('hex');
      fs.writeFileSync(secretPath, secret, { encoding: 'utf8' });
      logger.info('JWT secret created at data/jwt-secret.txt');
      return secret;
    }
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (e) {
    logger.error('Failed to ensure JWT secret', {
      error: (e as Error).message
    });
    // fallback to in-memory secret (not persisted)
    return crypto.randomBytes(64).toString('hex');
  }
}

export async function getAllUsers(): Promise<DbUser[]> {
  try {
    return await prisma.user.findMany();
  } catch (e) {
    logger.error('Failed to fetch users', { error: (e as Error).message });
    return [];
  }
}

export async function findUser(username: string): Promise<DbUser | null> {
  try {
    return await prisma.user.findUnique({ where: { username } });
  } catch (e) {
    logger.error(`Failed to find user: ${username}`, {
      error: (e as Error).message
    });
    return null;
  }
}

export async function createUser(data: DbUser): Promise<DbUser> {
  return await prisma.user.create({ data });
}

export async function updateUser(username: string, data: Partial<DbUser>): Promise<DbUser> {
  return await prisma.user.update({
    where: { username },
    data
  });
}

export async function deleteUser(username: string): Promise<DbUser> {
  return await prisma.user.delete({ where: { username } });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch (e) {
    logger.error('Password verification failed', {
      error: (e as Error).message
    });
    return false;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return await argon2.hash(plain);
}

export function getPublicUser(
  u: DbUser | null | undefined
): { username: string; role: string; display_name: string } | null {
  if (!u) return null;
  return {
    username: u.username,
    role: u.role,
    display_name: u.display_name || u.username
  };
}

export function signToken(
  user: DbUser,
  expiresInHours?: number
): { token: string; expires_in: number } {
  const secret = ensureJwtSecret();
  const expSeconds = Math.max(1, expiresInHours || getAuthConfig().tokenExpiresInHours) * 3600;
  const payload: JWTPayload = {
    sub: user.username,
    role: user.role,
    name: user.display_name || user.username,
    pwd_ver: user.last_password_change || new Date(0).toISOString()
  };
  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: expSeconds
  });
  return { token, expires_in: expSeconds };
}

// In-memory login attempts: key => { count, firstAt }
const attempts = new Map<string, LoginAttempt>();

function getClientIp(c: Context<AppEnv>): string {
  const remoteIp = c.env?.remoteIp;
  if (config.server?.trustProxy) {
    return (
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      remoteIp ||
      'unknown'
    );
  }
  return remoteIp || 'unknown';
}

export const loginRateLimiter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { windowMinutes, maxAttempts } = getAuthConfig().loginRateLimit;
  const windowMs = windowMinutes * 60 * 1000;
  const ip = getClientIp(c);
  let username = 'unknown';

  try {
    const cloned = c.req.raw.clone();
    const body = (await cloned.json()) as { username?: string };
    if (body?.username) {
      username = body.username;
    }
  } catch {
    // Ignore invalid JSON on probe
  }

  const key = `${ip}:${username}`;
  const now = Date.now();

  const rec = attempts.get(key) || { count: 0, firstAt: now };
  if (now - rec.firstAt > windowMs) {
    rec.count = 0;
    rec.firstAt = now;
  }
  rec.count += 1;
  attempts.set(key, rec);

  if (rec.count > maxAttempts) {
    return c.json(
      {
        success: false,
        message: 'Too many login attempts. Please try later.'
      },
      429
    );
  }
  return await next();
};

export const authenticateToken: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { enabled } = getAuthConfig();
  if (!enabled) {
    c.set('user', {
      username: 'dev',
      role: 'editor',
      name: 'Developer',
      pwd_ver: new Date().toISOString()
    });
    return await next();
  }

  if (c.req.path.startsWith('/api/auth/login')) {
    return await next();
  }

  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const secret = ensureJwtSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256']
    }) as JWTPayload;

    const user = await findUser(decoded.sub);
    if (!user || user.enabled === false) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const tokenPwdVer = new Date(decoded.pwd_ver || 0).getTime();
    const userPwdVer = new Date(user.last_password_change || 0).getTime();
    if (tokenPwdVer < userPwdVer) {
      return c.json({ success: false, message: 'Token expired' }, 401);
    }

    c.set('user', {
      username: user.username,
      role: user.role,
      name: user.display_name || user.username,
      pwd_ver: decoded.pwd_ver
    });
    return await next();
  } catch (e) {
    return c.json(
      {
        success: false,
        message: 'Unauthorized',
        error: (e as Error).message
      },
      401
    );
  }
};

export function authorize(
  roles: string | string[] = ['editor', 'reader']
): MiddlewareHandler<AppEnv> {
  const set = new Set(Array.isArray(roles) ? roles : [roles]);
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }
    if (!set.has(user.role)) {
      return c.json({ success: false, message: 'Forbidden' }, 403);
    }
    return await next();
  };
}

export const checkWritePermission: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  const method = c.req.method.toUpperCase();
  const { allowExportsForReader } = getAuthConfig();

  if (user.role === 'editor' || user.role === 'superuser') {
    return await next();
  }

  if (user.role === 'reader') {
    const requestPath = c.req.path;

    if (method === 'PUT' && READER_SELF_SERVICE_PATHS.has(requestPath)) {
      return await next();
    }

    if (method === 'GET') {
      return await next();
    }

    if (
      allowExportsForReader &&
      method === 'POST' &&
      (requestPath.startsWith('/api/export') ||
        requestPath.startsWith('/api/overview') ||
        requestPath.startsWith('/api/analysis'))
    ) {
      return await next();
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      logger.warn('Read-only users attempting to perform write operations.', {
        username: user.username,
        method: method,
        url: c.req.url,
        ip: getClientIp(c)
      });
      return c.json(
        {
          success: false,
          message: 'Read-only users are not authorized to perform this operation.',
          error_code: 'READ_ONLY_ACCESS_DENIED'
        },
        403
      );
    }
  }

  return c.json(
    {
      success: false,
      message: 'INSUFFICIENT_PERMISSIONS',
      error_code: 'INSUFFICIENT_PERMISSIONS'
    },
    403
  );
};
