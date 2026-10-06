import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import type { AuthInfo, OAuthTokenVerifier } from '@modelcontextprotocol/server';
import type { McpConfig, McpCredentialConfig, McpToolName } from '@/types/config';
import { MCP_STAGING_TOOL_NAMES, MCP_TOOL_NAMES, effectiveToolsForRole } from '@/mcp/tools';
import { mcpPrisma } from '@/prismaClient';

export type McpCredential = McpCredentialConfig;

const toolNames = new Set<string>(MCP_TOOL_NAMES);

export function validateMcpConfig(value: McpConfig): McpConfig {
  if (!value || typeof value !== 'object') throw new Error('MCP config must be an object.');
  if (typeof value.enabled !== 'boolean') throw new Error('MCP enabled must be a boolean.');
  if (!Array.isArray(value.allowedHosts) || !Array.isArray(value.allowedOrigins)) {
    throw new Error('MCP allowedHosts and allowedOrigins must be arrays.');
  }
  if (!Array.isArray(value.credentials)) throw new Error('MCP credentials must be an array.');
  if (
    value.stagingWrites !== undefined &&
    (!value.stagingWrites || typeof value.stagingWrites !== 'object' ||
      typeof value.stagingWrites.enabled !== 'boolean')
  ) {
    throw new Error('MCP stagingWrites.enabled must be a boolean.');
  }
  const stagingWrites = { enabled: value.stagingWrites?.enabled ?? false };
  if (!value.enabled) return { ...value, stagingWrites };
  if (
    value.allowedHosts.length === 0 ||
    value.allowedHosts.some((host) => typeof host !== 'string' || !host.trim())
  ) {
    throw new Error('Enabled MCP requires at least one valid allowed host.');
  }
  if (value.allowedOrigins.some((origin) => typeof origin !== 'string' || !origin.trim())) {
    throw new Error('MCP allowedOrigins must contain non-empty hostnames.');
  }

  const ids = new Set<string>();
  for (const credential of value.credentials) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(credential.id) || ids.has(credential.id)) {
      throw new Error(
        'MCP credential IDs must be unique and contain only letters, numbers, _ or -.'
      );
    }
    ids.add(credential.id);
    if (!/^[a-f0-9]{64}$/i.test(credential.tokenSha256)) {
      throw new Error(`MCP credential ${credential.id} has an invalid tokenSha256 value.`);
    }
    if (
      typeof credential.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(credential.expiresAt))
    ) {
      throw new Error(`MCP credential ${credential.id} has an invalid expiresAt value.`);
    }
    if (credential.enabled !== undefined && typeof credential.enabled !== 'boolean') {
      throw new Error(`MCP credential ${credential.id} enabled must be a boolean.`);
    }
    if (!Array.isArray(credential.tools) || credential.tools.length === 0) {
      throw new Error(`MCP credential ${credential.id} must allow at least one tool.`);
    }
    if (credential.tools.some((tool) => !toolNames.has(tool))) {
      throw new Error(`MCP credential ${credential.id} includes an unknown tool.`);
    }
    if (new Set(credential.tools).size !== credential.tools.length) {
      throw new Error(`MCP credential ${credential.id} contains duplicate tools.`);
    }
  }

  const requestsPerMinute = value.requestsPerMinute ?? 60;
  const maxConcurrentRequests = value.maxConcurrentRequests ?? 2;
  const maxConcurrentAnalysis = value.maxConcurrentAnalysis ?? 1;
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 10000) {
    throw new Error('MCP requestsPerMinute must be an integer from 1 to 10000.');
  }
  if (
    !Number.isInteger(maxConcurrentRequests) ||
    maxConcurrentRequests < 1 ||
    maxConcurrentRequests > 100
  ) {
    throw new Error('MCP maxConcurrentRequests must be an integer from 1 to 100.');
  }
  if (
    !Number.isInteger(maxConcurrentAnalysis) ||
    maxConcurrentAnalysis < 1 ||
    maxConcurrentAnalysis > 10
  ) {
    throw new Error('MCP maxConcurrentAnalysis must be an integer from 1 to 10.');
  }

  return {
    ...value,
    stagingWrites,
    requestsPerMinute,
    maxConcurrentRequests,
    maxConcurrentAnalysis
  };
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeHashEquals(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function findMcpCredential(
  config: McpConfig,
  token: string,
  now = Date.now()
): McpCredential | undefined {
  if (!config.enabled || !token || token.length > 512) return undefined;
  const tokenHash = hashMcpToken(token);
  return config.credentials.find(
    (credential) =>
      credential.enabled !== false &&
      Date.parse(credential.expiresAt) > now &&
      safeHashEquals(credential.tokenSha256, tokenHash)
  );
}

export function createMcpTokenVerifier(config: McpConfig): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const credential = findMcpCredential(config, token);
      if (credential)
        return {
          token,
          clientId: credential.id,
          scopes: credential.tools,
          expiresAt: Math.floor(Date.parse(credential.expiresAt) / 1000),
          extra: { budgetKey: `static:${credential.id}` }
        };
      if (!config.enabled || !token || token.length > 512) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid MCP access token.');
      }
      const connection = await mcpPrisma.mcpConnection
        .findUnique({
          where: { tokenSha256: hashMcpToken(token) },
          include: { owner: true }
        })
        .catch(() => {
          throw new Error('MCP credential lookup failed.');
        });
      if (
        !connection ||
        connection.revokedAt ||
        connection.expiresAt.getTime() <= Date.now() ||
        !connection.owner.enabled ||
        connection.passwordVersion !== connection.owner.last_password_change
      ) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid MCP access token.');
      }
      const allowed = new Set(
        effectiveToolsForRole(connection.owner.role, config.stagingWrites?.enabled === true)
      );
      return {
        token,
        clientId: connection.id,
        scopes: [
          ...new Set([
            ...connection.tools.filter((tool): tool is McpToolName =>
              allowed.has(tool as McpToolName)
            ),
            ...MCP_STAGING_TOOL_NAMES.filter((tool) => allowed.has(tool))
          ])
        ],
        expiresAt: Math.floor(connection.expiresAt.getTime() / 1000),
        extra: { budgetKey: `user:${connection.ownerUsername}` }
      };
    }
  };
}

export function generateMcpToken(): string {
  return `tfmcp_${randomBytes(32).toString('base64url')}`;
}
