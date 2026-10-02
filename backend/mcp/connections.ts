import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { mcpPrisma } from '@/prismaClient';
import { authenticateToken, getAuthConfig } from '@/utils/auth';
import { logger } from '@/utils/logger';
import { generateMcpToken, hashMcpToken } from '@/mcp/credentials';
import { toolsForRole } from '@/mcp/tools';
import type { McpConfig } from '@/types/config';

export const MCP_CREDENTIAL_DAYS = 90;
const createSchema = z
  .object({
    client: z.enum(['opencode', 'workbuddy']),
    deviceId: z.string().uuid()
  })
  .strict();
const idSchema = z.string().uuid();
const publicFields = {
  id: true,
  client: true,
  deviceId: true,
  tools: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true
} as const;

export function createMcpConnectionRouter(settings: McpConfig): Router {
  const router = Router();
  router.use((_req, res, next) => {
    if (!getAuthConfig().enabled) {
      res.status(409).json({
        success: false,
        code: 'AUTH_DISABLED',
        message: 'Account authentication must be enabled.'
      });
      return;
    }
    next();
  });
  router.use(authenticateToken);
  router.use((req, res, next) => {
    if (!req.user || toolsForRole(req.user.role).length === 0) {
      res.status(403).json({ success: false, code: 'ROLE_NOT_SUPPORTED' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/capabilities', (req, res) => {
    res.json({
      success: true,
      data: {
        version: 1,
        enabled: settings.enabled,
        endpointPath: '/mcp',
        allowedTools: toolsForRole(req.user!.role),
        credentialDays: MCP_CREDENTIAL_DAYS,
        dataScope: 'instance'
      }
    });
  });
  router.get('/connections', async (req, res) => {
    const data = await mcpPrisma.mcpConnection.findMany({
      where: { ownerUsername: req.user!.username },
      select: publicFields,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ success: true, data });
  });
  router.post('/connections', async (req, res) => {
    if (!settings.enabled) {
      res.status(409).json({ success: false, code: 'MCP_DISABLED' });
      return;
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, code: 'INVALID_CONNECTION' });
      return;
    }
    const owner = await mcpPrisma.user.findUnique({ where: { username: req.user!.username } });
    if (!owner?.enabled) {
      res.status(401).json({ success: false, code: 'ACCOUNT_DISABLED' });
      return;
    }
    const token = generateMcpToken();
    const connection = await mcpPrisma.mcpConnection.create({
      data: {
        ownerUsername: owner.username,
        ...parsed.data,
        tokenSha256: hashMcpToken(token),
        tools: toolsForRole(owner.role),
        passwordVersion: owner.last_password_change,
        expiresAt: new Date(Date.now() + MCP_CREDENTIAL_DAYS * 86_400_000)
      },
      select: publicFields
    });
    logger.info('MCP connection created', {
      connectionId: connection.id,
      client: connection.client
    });
    res.status(201).json({ success: true, data: { ...connection, token } });
  });
  router.delete('/connections/:id', async (req, res) => {
    const parsed = idSchema.safeParse(req.params['id']);
    if (!parsed.success) {
      res.status(400).json({ success: false, code: 'INVALID_CONNECTION' });
      return;
    }
    const existing = await mcpPrisma.mcpConnection.findFirst({
      where: {
        id: parsed.data,
        ownerUsername: req.user!.username
      }
    });
    if (!existing) {
      res.status(404).json({ success: false, code: 'CONNECTION_NOT_FOUND' });
      return;
    }
    await mcpPrisma.mcpConnection.updateMany({
      where: {
        id: existing.id,
        ownerUsername: req.user!.username,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
    logger.info('MCP connection revoked', { connectionId: existing.id });
    res.status(204).end();
  });
  router.use((_req, res) => res.status(404).json({ success: false, code: 'NOT_FOUND' }));
  router.use((_error: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error('MCP connection operation failed', { operation: req.method, status: 500 });
    res.status(500).json({ success: false, code: 'CONNECTION_OPERATION_FAILED' });
  });
  return router;
}
