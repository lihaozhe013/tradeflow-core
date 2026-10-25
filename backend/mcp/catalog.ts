import { createHash } from 'node:crypto';
import type { McpToolName } from '@/types/config';
import { effectiveToolsForRole } from '@/mcp/tools';

export type McpToolGroup =
  'reference' | 'inventory' | 'transactions' | 'finance' | 'analysis' | 'drafts';

export interface McpCatalogTool {
  name: McpToolName;
  group: McpToolGroup;
  summary: string;
  mutating: boolean;
}

/**
 * Public tool catalog. The version is derived from the visible entries, so adding or changing a
 * tool changes the version without a manual bump. Tool schemas remain authoritative through
 * `tools/list`; this catalog only supports connection guidance and update detection.
 */
export const MCP_CATALOG: readonly McpCatalogTool[] = [
  {
    name: 'search_partners',
    group: 'reference',
    summary: 'Resolve customer and supplier codes and names.',
    mutating: false
  },
  {
    name: 'search_products',
    group: 'reference',
    summary: 'Resolve product codes, models, and categories.',
    mutating: false
  },
  {
    name: 'get_inventory',
    group: 'inventory',
    summary: 'Read current on-hand inventory.',
    mutating: false
  },
  {
    name: 'list_transactions',
    group: 'transactions',
    summary: 'List inbound or outbound transaction records.',
    mutating: false
  },
  {
    name: 'get_receivables',
    group: 'finance',
    summary: 'Read receivable balances or one customer detail.',
    mutating: false
  },
  {
    name: 'get_payables',
    group: 'finance',
    summary: 'Read payable balances or one supplier detail.',
    mutating: false
  },
  {
    name: 'get_analysis',
    group: 'analysis',
    summary: 'Read purchase or sales analysis with FIFO cost and profit.',
    mutating: false
  },
  {
    name: 'submit_transaction_drafts',
    group: 'drafts',
    summary: 'Stage inbound or outbound rows for human review.',
    mutating: true
  },
  {
    name: 'update_transaction_draft',
    group: 'drafts',
    summary: 'Update one pending draft owned by the caller.',
    mutating: true
  },
  {
    name: 'list_transaction_drafts',
    group: 'drafts',
    summary: 'List drafts owned by the caller.',
    mutating: false
  },
  {
    name: 'get_transaction_draft',
    group: 'drafts',
    summary: 'Read one draft owned by the caller.',
    mutating: false
  }
];

export const MCP_GUIDE_VERSION = '2';
export const MIN_BRIDGE_VERSION = '0.2.0';

export function catalogForRole(role: string, stagingWritesEnabled: boolean): McpCatalogTool[] {
  const allowed = new Set<string>(effectiveToolsForRole(role, stagingWritesEnabled));
  return MCP_CATALOG.filter((tool) => allowed.has(tool.name));
}

export function catalogVersion(tools: readonly McpCatalogTool[]): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify(
        tools.map((tool) => [tool.name, tool.group, tool.summary, tool.mutating] as const)
      )
    )
    .digest('hex');
  return digest.slice(0, 12);
}

export function roleCatalog(role: string, stagingWritesEnabled: boolean) {
  const tools = catalogForRole(role, stagingWritesEnabled);
  return {
    version: catalogVersion(tools),
    guideVersion: MCP_GUIDE_VERSION,
    minBridgeVersion: MIN_BRIDGE_VERSION,
    tools
  };
}
