import type { McpToolName } from '@/types/config';

export const MCP_TOOL_NAMES: readonly McpToolName[] = [
  'search_partners',
  'search_products',
  'get_inventory',
  'list_transactions',
  'get_receivables',
  'get_payables',
  'get_analysis'
];

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
      ? [...MCP_TOOL_NAMES]
      : [];
}
