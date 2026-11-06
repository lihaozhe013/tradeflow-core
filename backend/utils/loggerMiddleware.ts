import type { MiddlewareHandler } from 'hono';
import { prisma } from '@/prismaClient';
import type { AppEnv } from '@/types/hono';

/**
 * Paths that should not be logged (e.g., manual snapshot refreshes)
 */
const IGNORED_PATHS = new Set([
  '/api/overview/stats',
  '/api/inventory/refresh',
  '/api/payable/invoices/refresh',
  '/api/receivable/invoices/refresh'
]);

/**
 * Sensitive keys to mask in the logs
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'access_token',
  'refreshToken',
  'oldPassword',
  'newPassword',
  'confirmnewPassword'
];

function shouldSkipLogging(path: string, url: string): boolean {
  const cleanPath = path.split('?')[0] ?? '';
  if (cleanPath.startsWith('/api/settings')) return true;
  if (cleanPath.startsWith('/api/transaction-drafts')) return true;
  if (cleanPath === '/api/mcp' || cleanPath.startsWith('/api/mcp/')) return true;
  if (cleanPath === '/mcp' || cleanPath.startsWith('/mcp/')) return true;

  // Check exact matches
  if (IGNORED_PATHS.has(cleanPath)) return true;

  // Check for refresh patterns (common in snapshot operations)
  if (url.includes('/refresh/')) return true;

  return false;
}

function maskSensitiveData(data: unknown): unknown {
  if (!data) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item: unknown) => maskSensitiveData(item));
  }

  const masked = { ...(data as Record<string, unknown>) };
  for (const key of Object.keys(masked)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      masked[key] = '******';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked;
}

/**
 * Access Logger Middleware
 * Logs modifications (POST, PUT, DELETE, PATCH) to the database.
 */
export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Only log mutations
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(c.req.method)) {
    return await next();
  }

  const path = c.req.path;
  const url = c.req.url;

  if (shouldSkipLogging(path, url)) {
    return await next();
  }

  let bodyToLog: string | null = null;
  try {
    const cloned = c.req.raw.clone();
    const body = await cloned.json();
    if (body) {
      bodyToLog = JSON.stringify(maskSensitiveData(body));
    }
  } catch {
    // ignore non-json body
  }

  await next();

  if (c.res.status) {
    try {
      const user = c.get('user');
      const username = user?.username || 'anonymous';
      const parsedUrl = new URL(url, 'http://localhost');
      const resource = parsedUrl.pathname + parsedUrl.search;

      if (username === 'anonymous' && resource !== '/api/auth/login') {
        return;
      }

      await prisma.systemLog.create({
        data: {
          username,
          action: c.req.method,
          resource,
          user_agent: c.req.header('user-agent') || '',
          params: bodyToLog
        }
      });
    } catch (error) {
      console.error('Failed to write system log:', error);
    }
  }
};

/**
 * Error Log Middleware
 */
export const errorLogger = (
  err: Error,
  path: string,
  method: string,
  username = 'anonymous'
): void => {
  console.error('API Error', {
    message: err.message,
    stack: err.stack,
    method,
    url: path,
    user: username
  });
};
