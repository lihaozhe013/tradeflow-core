import type { Role } from '@/auth/auth.types';
import { AUTH_CONFIG } from '@/config';

export type Capability =
  'read' | 'writeData' | 'manageUsers' | 'viewAudit' | 'readerPost';

export type ProtectedWriteMethod = 'POST' | 'PUT' | 'DELETE' | 'PATCH';

const READER_POST_PREFIXES = ['/export', '/overview', '/analysis'] as const;

const isKnownRole = (role: Role | null | undefined): role is Role =>
  role === 'reader' || role === 'editor' || role === 'superuser';

export const hasRolePermission = (
  role: Role | null | undefined,
  requiredRole: Role,
): boolean => {
  if (!isKnownRole(role)) return false;

  if (requiredRole === 'reader') {
    return true;
  }

  if (requiredRole === 'editor') {
    return role === 'editor' || role === 'superuser';
  }

  return role === 'superuser';
};

export const hasCapability = (
  role: Role | null | undefined,
  capability: Capability,
): boolean => {
  if (!isKnownRole(role)) return false;

  switch (capability) {
    case 'read':
    case 'viewAudit':
      return true;
    case 'writeData':
      return role === 'editor' || role === 'superuser';
    case 'manageUsers':
      return role === 'superuser';
    case 'readerPost':
      return (
        role === 'editor' ||
        role === 'superuser' ||
        (role === 'reader' && AUTH_CONFIG.allowExportsForReader !== false)
      );
    default:
      return false;
  }
};

const normalizePath = (url: string): string => {
  try {
    return new URL(url, window.location.origin).pathname.replace(/^\/api/, '');
  } catch {
    return url.split('?')[0].replace(/^\/api/, '');
  }
};

const isReaderPostPathAllowed = (url: string): boolean => {
  if (AUTH_CONFIG.allowExportsForReader === false) return false;

  const path = normalizePath(url);
  return READER_POST_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
};

export const canReaderUseRequest = (
  method: string | undefined,
  url: string,
): boolean => {
  const normalizedMethod = (method ?? 'GET').toUpperCase();

  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(normalizedMethod)) {
    return true;
  }

  return normalizedMethod === 'POST' && isReaderPostPathAllowed(url);
};

export const canRoleUseRequest = (
  role: Role | null | undefined,
  method: string | undefined,
  url: string,
): boolean => role !== 'reader' || canReaderUseRequest(method, url);
