import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { resolveFilesInDataPath, config } from '@/utils/paths';

const usersPath: string = resolveFilesInDataPath('users.json');
const secretPath: string = resolveFilesInDataPath('jwt-secret.txt');

interface UserData {
  username: string;
  password_hash?: string;
  role: string;
  display_name?: string;
  displayName?: string;
  enabled?: boolean;
  last_password_change?: string;
  lastPasswordChange?: string;
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

function readJSONSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readJSONSync(filePath) as T;
  } catch (e) {
    logger.warn('Failed to read JSON file', {
      filePath,
      error: (e as Error).message,
    });
    return fallback;
  }
}

export function getAuthConfig(): AuthConfig {
  const auth = config?.auth;
  return {
    enabled: auth?.enabled ?? false,
    tokenExpiresInHours: auth?.tokenExpiresInHours || 12,
    loginRateLimit: {
      windowMinutes: auth?.loginRateLimit?.windowMinutes || 5,
      maxAttempts: auth?.loginRateLimit?.maxAttempts || 20,
    },
    allowExportsForReader:
      auth?.allowExportsForReader !== undefined ? auth.allowExportsForReader : true,
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
      error: (e as Error).message,
    });
    // fallback to in-memory secret (not persisted)
    return crypto.randomBytes(64).toString('hex');
  }
}

export function loadUsers(): UserData[] {
  const data = readJSONSafe<{ users?: UserData[] }>(usersPath, { users: [] });
  return Array.isArray(data?.users) ? data.users : [];
}

export function findUser(username: string): UserData | undefined {
  const users = loadUsers();
  return users.find((u) => u.username === username);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch (e) {
    return false;
  }
}

export function getPublicUser(
  u: UserData | null | undefined,
): { username: string; role: string; display_name: string } | null {
  if (!u) return null;
  return {
    username: u.username,
    role: u.role,
    display_name: u.display_name || u.displayName || u.username,
  };
}

export function signToken(
  user: UserData,
  expiresInHours?: number,
): { token: string; expires_in: number } {
  const secret = ensureJwtSecret();
  const expSeconds = Math.max(1, expiresInHours || getAuthConfig().tokenExpiresInHours) * 3600;
  const payload: JWTPayload = {
    sub: user.username,
    role: user.role,
    name: user.display_name || user.displayName || user.username,
    pwd_ver: user.last_password_change || user.lastPasswordChange || new Date(0).toISOString(),
  };
  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: expSeconds,
  });
  return { token, expires_in: expSeconds };
}

// In-memory login attempts: key => { count, firstAt }
const attempts = new Map<string, LoginAttempt>();

export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const { windowMinutes, maxAttempts } = getAuthConfig().loginRateLimit;
  const windowMs = windowMinutes * 60 * 1000;
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const username = (req.body && req.body.username) || 'unknown';
  const key = `${ip}:${username}`;
  const now = Date.now();

  const rec = attempts.get(key) || { count: 0, firstAt: now };
  if (now - rec.firstAt > windowMs) {
    // reset window
    rec.count = 0;
    rec.firstAt = now;
  }
  rec.count += 1;
  attempts.set(key, rec);

  if (rec.count > maxAttempts) {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try later.',
    });
    return;
  }
  next();
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const { enabled } = getAuthConfig();
  if (!enabled) {
    // Auth disabled: inject a dev user
    req.user = {
      username: 'dev',
      role: 'editor',
      name: 'Developer',
      pwd_ver: new Date().toISOString(),
    };
    next();
    return;
  }

  // Allow unauthenticated access to login route
  if (req.originalUrl && req.originalUrl.startsWith('/api/auth/login')) {
    next();
    return;
  }

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  try {
    const secret = ensureJwtSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as JWTPayload;
    const user = findUser(decoded.sub);
    if (!user || user.enabled === false) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const tokenPwdVer = new Date(decoded.pwd_ver || 0).getTime();
    const userPwdVer = new Date(user.last_password_change || 0).getTime();
    if (tokenPwdVer < userPwdVer) {
      res.status(401).json({ success: false, message: 'Token expired' });
      return;
    }
    req.user = {
      username: user.username,
      role: user.role,
      name: user.display_name || user.username,
      pwd_ver: decoded.pwd_ver,
    };
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}

export function authorize(roles: string | string[] = ['editor', 'reader']) {
  const set = new Set(Array.isArray(roles) ? roles : [roles]);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!set.has(req.user.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    next();
  };
}

// Check write permissions for read-only users
export function checkWritePermission(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  const method = req.method.toUpperCase();
  const { allowExportsForReader } = getAuthConfig();

  if (req.user.role === 'editor') {
    next();
    return;
  }

  if (req.user.role === 'reader') {
    if (method === 'GET') {
      next();
      return;
    }

    // Reader can use the POST request for the export feature and refresh overview + analysis pages
    if (
      allowExportsForReader &&
      method === 'POST' &&
      (req.originalUrl.includes('/api/export') ||
        req.originalUrl.includes('/api/overview') ||
        req.originalUrl.includes('/api/analysis'))
    ) {
      next();
      return;
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      logger.warn('Read-only users attempting to perform write operations.', {
        username: req.user.username,
        method: method,
        url: req.originalUrl,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        message: 'Read-only users are not authorized to perform this operation.',
        error_code: 'READ_ONLY_ACCESS_DENIED',
      });
      return;
    }
  }

  // Access denied for other unknown roles.
  res.status(403).json({
    success: false,
    message: 'INSUFFICIENT_PERMISSIONS',
    error_code: 'INSUFFICIENT_PERMISSIONS',
  });
}
