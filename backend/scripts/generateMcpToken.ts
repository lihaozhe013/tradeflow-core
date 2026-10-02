import * as yaml from 'js-yaml';
import { hashMcpToken, generateMcpToken } from '@/mcp/credentials';
import { MCP_TOOL_NAMES } from '@/mcp/tools';
import type { McpToolName } from '@/types/config';

const [id, toolsValue, daysValue] = process.argv.slice(2);

if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !toolsValue) {
  console.error(
    'Usage: bun run scripts/generateMcpToken.ts <credential-id> <comma-separated-tools> [valid-days]'
  );
  process.exit(2);
}

const tools = [...new Set(toolsValue.split(',').map((tool) => tool.trim()))];
if (tools.length === 0 || tools.some((tool) => !MCP_TOOL_NAMES.includes(tool as McpToolName))) {
  console.error(`Tools must be selected from: ${MCP_TOOL_NAMES.join(', ')}`);
  process.exit(2);
}

const validDays = daysValue === undefined ? 90 : Number(daysValue);
if (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650) {
  console.error('valid-days must be an integer from 1 to 3650.');
  process.exit(2);
}

const token = generateMcpToken();
const credential = {
  id,
  tokenSha256: hashMcpToken(token),
  expiresAt: new Date(Date.now() + validDays * 86_400_000).toISOString(),
  enabled: true,
  tools: tools as McpToolName[]
};

console.info(`Bearer token (shown once):\n${token}`);
console.info('\nAdd this entry to config/config.yaml under mcp.credentials:');
console.info(yaml.dump(credential, { lineWidth: -1, noRefs: true }).trimEnd());
