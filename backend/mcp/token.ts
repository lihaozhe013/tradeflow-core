import { createHash, randomBytes } from 'node:crypto';

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateMcpToken(): string {
  return `tfmcp_${randomBytes(32).toString('base64url')}`;
}
