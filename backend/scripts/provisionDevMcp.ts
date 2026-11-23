import fs from 'node:fs';
import * as yaml from 'js-yaml';
import { generateMcpToken, hashMcpToken } from '@/mcp/token';
import { MCP_TOOL_NAMES } from '@/mcp/tools';
import { applyDatabaseEnvironmentOverrides } from '@/utils/configOverrides';
import type { AppConfig, McpConfig, McpCredentialConfig } from '@/types/config';

const LOCAL_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const [configPath, credentialId = 'dev-local', daysValue = '365'] = process.argv.slice(2);

if (!configPath) {
  console.error(
    'Usage: bun run scripts/provisionDevMcp.ts <config-path> [credential-id] [valid-days]'
  );
  process.exit(2);
}
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(credentialId)) {
  console.error('credential-id must contain only letters, numbers, _ or -, up to 64 characters.');
  process.exit(2);
}

const validDays = Number(daysValue);
if (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650) {
  console.error('valid-days must be an integer from 1 to 3650.');
  process.exit(2);
}
if (!fs.existsSync(configPath)) {
  console.error(`Configuration file not found: ${configPath}`);
  process.exit(2);
}

const config = applyDatabaseEnvironmentOverrides(
  yaml.load(fs.readFileSync(configPath, 'utf8')) as AppConfig
);
const mcp: McpConfig = config.mcp ?? {
  enabled: true,
  allowedHosts: LOCAL_ALLOWED_HOSTS,
  allowedOrigins: [],
  credentials: []
};
const credentials = Array.isArray(mcp.credentials) ? mcp.credentials : [];
const token = generateMcpToken();
const credential: McpCredentialConfig = {
  id: credentialId,
  tokenSha256: hashMcpToken(token),
  expiresAt: new Date(Date.now() + validDays * 86_400_000).toISOString(),
  enabled: true,
  tools: [...MCP_TOOL_NAMES]
};

config.mcp = {
  ...mcp,
  enabled: true,
  allowedHosts: mcp.allowedHosts?.length ? mcp.allowedHosts : LOCAL_ALLOWED_HOSTS,
  credentials: [...credentials.filter((entry) => entry.id !== credentialId), credential]
};

fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1, noRefs: true }), 'utf8');
process.stdout.write(`${token}\n`);
