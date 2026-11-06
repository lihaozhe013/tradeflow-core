import { Hono } from 'hono';
import { z } from 'zod';
import { mcpPrisma } from '@/prismaClient';
import { authenticateToken, getAuthConfig } from '@/utils/auth';
import { logger } from '@/utils/logger';
import { generateMcpToken, hashMcpToken } from '@/mcp/credentials';
import { effectiveToolsForRole, MCP_STAGING_TOOL_NAMES, toolsForRole } from '@/mcp/tools';
import { MCP_GUIDE_VERSION, MIN_BRIDGE_VERSION, roleCatalog } from '@/mcp/catalog';
import type { McpConfig } from '@/types/config';
import type { AppEnv } from '@/types/hono';

export const MCP_CREDENTIAL_DAYS = 90;

const clientNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, 'Use letters, numbers, spaces, . _ or -.');
const createSchema = z
  .object({
    client: clientNameSchema,
    deviceId: z.string().uuid()
  })
  .strict();
const idSchema = z.string().uuid();
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    status: z.enum(['active', 'revoked', 'expired', 'password_changed']).optional(),
    client: clientNameSchema.optional()
  })
  .strict();
const publicFields = {
  id: true,
  client: true,
  deviceId: true,
  tools: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true
} as const;

function catalogMetadata(role: string, stagingWritesEnabled: boolean) {
  const catalog = roleCatalog(role, stagingWritesEnabled);
  return {
    catalogVersion: catalog.version,
    guideVersion: MCP_GUIDE_VERSION,
    minBridgeVersion: MIN_BRIDGE_VERSION
  };
}

export function createMcpConnectionRouter(settings: McpConfig): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', async (c, next) => {
    if (!getAuthConfig().enabled) {
      return c.json(
        {
          success: false,
          code: 'AUTH_DISABLED',
          message: 'Account authentication must be enabled.'
        },
        409
      );
    }
    return await next();
  });

  router.use('*', authenticateToken);

  router.use('*', async (c, next) => {
    const user = c.get('user');
    if (!user || toolsForRole(user.role).length === 0) {
      return c.json({ success: false, code: 'ROLE_NOT_SUPPORTED' }, 403);
    }
    c.header('Cache-Control', 'no-store');
    return await next();
  });

  router.get('/capabilities', (c) => {
    const user = c.get('user')!;
    return c.json({
      success: true,
      data: {
        version: 1,
        enabled: settings.enabled,
        endpointPath: '/mcp',
        allowedTools: toolsForRole(user.role),
        effectiveTools: effectiveToolsForRole(
          user.role,
          settings.stagingWrites?.enabled === true
        ),
        stagingWritesEnabled: settings.stagingWrites?.enabled === true,
        credentialDays: MCP_CREDENTIAL_DAYS,
        dataScope: 'instance',
        ...catalogMetadata(user.role, settings.stagingWrites?.enabled === true)
      }
    });
  });

  router.get('/catalog', (c) => {
    const user = c.get('user')!;
    return c.json({
      success: true,
      data: roleCatalog(user.role, settings.stagingWrites?.enabled === true)
    });
  });

  router.get('/connections', async (c) => {
    const parsed = listSchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ success: false, code: 'INVALID_CONNECTION_QUERY' }, 400);
    }
    const user = c.get('user')!;
    const owner = await mcpPrisma.user.findUniqueOrThrow({
      where: { username: user.username }
    });
    const { page, limit, status, client } = parsed.data;
    const now = new Date();
    const sameVersion = { passwordVersion: owner.last_password_change };
    const differentVersion =
      owner.last_password_change === null
        ? { passwordVersion: { not: null } }
        : {
            OR: [
              { passwordVersion: null },
              { passwordVersion: { not: owner.last_password_change } }
            ]
          };
    const statusFilter =
      status === 'revoked'
        ? { revokedAt: { not: null } }
        : status === 'expired'
          ? { revokedAt: null, expiresAt: { lte: now } }
          : status === 'password_changed'
            ? { revokedAt: null, expiresAt: { gt: now }, ...differentVersion }
            : status === 'active'
              ? { revokedAt: null, expiresAt: { gt: now }, ...sameVersion }
              : {};
    const where = { ownerUsername: owner.username, ...(client ? { client } : {}), ...statusFilter };
    const [total, rows] = await mcpPrisma.$transaction([
      mcpPrisma.mcpConnection.count({ where }),
      mcpPrisma.mcpConnection.findMany({
        where,
        select: { ...publicFields, passwordVersion: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      })
    ]);
    const allowed = new Set<string>(
      effectiveToolsForRole(owner.role, settings.stagingWrites?.enabled === true)
    );
    const data = rows.map(({ passwordVersion, ...entry }) => ({
      ...entry,
      status: entry.revokedAt
        ? 'revoked'
        : entry.expiresAt <= now
          ? 'expired'
          : passwordVersion !== owner.last_password_change
            ? 'password_changed'
            : 'active',
      effectiveTools: [
        ...entry.tools.filter((tool) => allowed.has(tool)),
        ...MCP_STAGING_TOOL_NAMES.filter((tool) => allowed.has(tool))
      ]
    }));
    return c.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  });

  router.post('/connections', async (c) => {
    if (!settings.enabled) {
      return c.json({ success: false, code: 'MCP_DISABLED' }, 409);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, code: 'INVALID_CONNECTION' }, 400);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, code: 'INVALID_CONNECTION' }, 400);
    }
    const user = c.get('user')!;
    const owner = await mcpPrisma.user.findUnique({ where: { username: user.username } });
    if (!owner?.enabled) {
      return c.json({ success: false, code: 'ACCOUNT_DISABLED' }, 401);
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
    return c.json(
      {
        success: true,
        data: {
          ...connection,
          token,
          effectiveTools: effectiveToolsForRole(owner.role, settings.stagingWrites?.enabled === true),
          ...catalogMetadata(owner.role, settings.stagingWrites?.enabled === true)
        }
      },
      201
    );
  });

  router.delete('/connections/:id', async (c) => {
    const parsed = idSchema.safeParse(c.req.param('id'));
    if (!parsed.success) {
      return c.json({ success: false, code: 'INVALID_CONNECTION' }, 400);
    }
    const user = c.get('user')!;
    const existing = await mcpPrisma.mcpConnection.findFirst({
      where: {
        id: parsed.data,
        ownerUsername: user.username
      }
    });
    if (!existing) {
      return c.json({ success: false, code: 'CONNECTION_NOT_FOUND' }, 404);
    }
    await mcpPrisma.mcpConnection.updateMany({
      where: {
        id: existing.id,
        ownerUsername: user.username,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
    logger.info('MCP connection revoked', { connectionId: existing.id });
    return c.body(null, 204);
  });

  router.all('*', (c) => c.json({ success: false, code: 'NOT_FOUND' }, 404));

  return router;
}
