import type { McpToolName } from '@/types/config';

export const MCP_TOOL_NAMES: readonly McpToolName[] = [
  'search_partners',
  'search_products',
  'get_inventory',
  'list_transactions',
  'get_receivables',
  'get_payables',
  'get_analysis',
  'submit_transaction_drafts',
  'update_transaction_draft',
  'list_transaction_drafts',
  'get_transaction_draft'
];

export const MCP_STAGING_TOOL_NAMES: readonly McpToolName[] = [
  'submit_transaction_drafts',
  'update_transaction_draft',
  'list_transaction_drafts',
  'get_transaction_draft'
];
export const READ_MCP_TOOL_NAMES = MCP_TOOL_NAMES.filter(
  (name) => !MCP_STAGING_TOOL_NAMES.includes(name)
);

export const DEFAULT_MCP_PAGE_SIZE = 20;
export const MAX_MCP_PAGE_SIZE = 100;

const READER_TOOLS: McpToolName[] = [
  'search_partners',
  'search_products',
  'get_inventory',
  'list_transactions'
];
export function toolsForRole(role: string): McpToolName[] {
  return role === 'reader'
    ? [...READER_TOOLS]
    : role === 'editor' || role === 'superuser'
      ? [...READ_MCP_TOOL_NAMES]
      : [];
}

export function effectiveToolsForRole(role: string, stagingWritesEnabled: boolean): McpToolName[] {
  const tools = toolsForRole(role);
  return stagingWritesEnabled && (role === 'editor' || role === 'superuser')
    ? [...tools, ...MCP_STAGING_TOOL_NAMES]
    : tools;
}
