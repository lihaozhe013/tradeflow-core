import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/prismaClient';

/**
 * Paths that should not be logged (e.g., manual cache refreshes)
 */
const IGNORED_PATHS = [
  '/api/overview/stats',
  '/api/analysis/refresh',
  '/api/inventory/refresh',
  '/api/payable/invoices/refresh',
  '/api/receivable/invoices/refresh',
];

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
  'confirmnewPassword',
];

function shouldSkipLogging(req: Request): boolean {
  // Check exact matches
  if (IGNORED_PATHS.includes(req.path)) return true;

  // Check for refresh patterns (common in cache operations)
  if (req.originalUrl.includes('/refresh/')) return true;

  return false;
}

function maskSensitiveData(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  const masked = { ...data };
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
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Only log mutations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Check if this request should be skipped
    if (shouldSkipLogging(req)) {
      next();
      return;
    }

    res.on('finish', async () => {
      // Only log if the request was processed (status code exists and no error preventing request handling)
      // Usually logging regardless of success is better for audit, but let's stick to user request "if valid"
      if (res.statusCode) {
        try {
          const username = req.user?.username || 'anonymous';

          let bodyToLog = null;
          if (req.body) {
            // Mask sensitive fields
            const maskedBody = maskSensitiveData(req.body);
            bodyToLog = JSON.stringify(maskedBody);
          }

          await prisma.systemLog.create({
            data: {
              username,
              action: req.method,
              resource: req.originalUrl,
              ip: req.ip || req.socket.remoteAddress || '',
              user_agent: req.get('User-Agent') || '',
              params: bodyToLog,
            },
          });
        } catch (error) {
          console.error('Failed to write system log:', error);
        }
      }
    });
  }

  next();
};

/**
 * Error Log Middleware
 */
export const errorLogger = (err: Error, req: Request, _res: Response, next: NextFunction): void => {
  console.error('API Error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    user: req.user?.username || 'anonymous',
  });
  next(err);
};
