import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { McpConfig, McpToolName } from '@/types/config';
import {
  DraftConflictError,
  DraftNotFoundError,
  draftFieldsSchema,
  draftIssues,
  findDraft,
  listDrafts,
  submitDraftBatch,
  updateDraft,
  type DraftSource
} from '@/services/transactionDraftService';
import { logger } from '@/utils/logger';
import { withMcpReadOnlyTransaction } from '@/mcp/database';

const pageSchema = z.number().int().min(1).default(1);
const limitSchema = z.number().int().min(1).max(100).default(20);
const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const submitAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;
const updateAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false
} as const;

function reply(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
}

function errorReply(error: unknown, tool: McpToolName) {
  if (error instanceof DraftConflictError) {
    return { isError: true, ...reply({ code: error.code }) };
  }
  if (error instanceof DraftNotFoundError) {
    return { isError: true, ...reply({ code: 'DRAFT_NOT_FOUND' }) };
  }
  if (error instanceof Error && error.message === 'IDEMPOTENCY_CONFLICT') {
    return { isError: true, ...reply({ code: error.message }) };
  }
  logger.error('MCP transaction draft tool failed', {
    tool,
    errorName: error instanceof Error ? error.name : 'UnknownError'
  });
  return { isError: true, content: [{ type: 'text' as const, text: 'The draft operation failed.' }] };
}

function serializeDraft(row: Awaited<ReturnType<typeof findDraft>>, issues: unknown[] = []) {
  if (!row) return null;
  const original = row.first_payload as { record?: unknown } | null;
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    version: row.version,
    partner_code: row.partner_code,
    partner_text: row.partner_text,
    product_code: row.product_code,
    product_text: row.product_text,
    quantity: row.quantity,
    unit_price: row.unit_price,
    transaction_date: row.transaction_date,
    invoice_date: row.invoice_date,
    invoice_number: row.invoice_number,
    receipt_number: row.receipt_number,
    order_number: row.order_number,
    remark: row.remark,
    original: original?.record ?? null,
    request_id: row.request_id,
    row_index: row.row_index,
    source_id: row.source_id,
    last_modified_by: row.last_modified_by,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    reject_reason: row.reject_reason,
    approved_record_id: row.approved_record_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    issues
  };
}

export function createMcpDraftTools(
  server: McpServer,
  allowedTools: ReadonlySet<McpToolName>,
  settings: McpConfig,
  source: DraftSource
): void {
  if (!settings.stagingWrites?.enabled) return;

  if (allowedTools.has('submit_transaction_drafts')) {
    server.registerTool(
      'submit_transaction_drafts',
      {
        description: 'Submit inbound or outbound transaction rows to the review queue. This never writes formal records or inventory.',
        inputSchema: {
          direction: z.enum(['inbound', 'outbound']),
          requestId: z.string().trim().min(1).max(128),
          records: z.array(draftFieldsSchema).min(1).max(100)
        },
        annotations: submitAnnotations
      },
      async (args) => {
        try {
          const result = await submitDraftBatch(
            args.direction,
            args.requestId,
            args.records,
            source
          );
          const issues = await withMcpReadOnlyTransaction((db) => draftIssues(result.data, db));
          return reply({
            duplicate: result.duplicate,
            records: result.data.map((row) => serializeDraft(row, issues[row.id] ?? []))
          });
        } catch (error) {
          return errorReply(error, 'submit_transaction_drafts');
        }
      }
    );
  }

  if (allowedTools.has('update_transaction_draft')) {
    server.registerTool(
      'update_transaction_draft',
      {
        description: 'Edit a pending transaction draft submitted within your MCP access scope. Supply the current version.',
        inputSchema: {
          id: z.string().uuid(),
          expectedVersion: z.number().int().positive(),
          patch: draftFieldsSchema.refine((patch) => Object.keys(patch).length > 0)
        },
        annotations: updateAnnotations
      },
      async (args) => {
        try {
          const row = await updateDraft(args.id, args.expectedVersion, args.patch, source);
          const issues = await withMcpReadOnlyTransaction((db) => draftIssues([row], db));
          return reply(serializeDraft(row, issues[row.id] ?? []));
        } catch (error) {
          return errorReply(error, 'update_transaction_draft');
        }
      }
    );
  }

  if (allowedTools.has('list_transaction_drafts')) {
    server.registerTool(
      'list_transaction_drafts',
      {
        description: 'List transaction drafts submitted by this account or static credential.',
        inputSchema: {
          direction: z.enum(['inbound', 'outbound']).optional(),
          status: z.enum(['pending', 'approved', 'rejected']).optional(),
          requestId: z.string().trim().min(1).max(128).optional(),
          page: pageSchema,
          limit: limitSchema
        },
        annotations: readAnnotations
      },
      async (args) => {
        try {
          const result = await withMcpReadOnlyTransaction((db) =>
            listDrafts(
              {
                direction: args.direction,
                status: args.status,
                requestId: args.requestId,
                page: args.page,
                limit: args.limit
              },
              source.scopeKey,
              db
            )
          );
          const issues = await withMcpReadOnlyTransaction((db) => draftIssues(result.data, db));
          return reply({
            ...result,
            data: result.data.map((row) => serializeDraft(row, issues[row.id] ?? []))
          });
        } catch (error) {
          return errorReply(error, 'list_transaction_drafts');
        }
      }
    );
  }

  if (allowedTools.has('get_transaction_draft')) {
    server.registerTool(
      'get_transaction_draft',
      {
        description: 'Read one transaction draft within this account or static credential scope.',
        inputSchema: { id: z.string().uuid() },
        annotations: readAnnotations
      },
      async (args) => {
        try {
          const row = await withMcpReadOnlyTransaction((db) =>
            findDraft(args.id, source.scopeKey, db)
          );
          if (!row) return { isError: true, ...reply({ code: 'DRAFT_NOT_FOUND' }) };
          const issues = await withMcpReadOnlyTransaction((db) => draftIssues([row], db));
          return reply(serializeDraft(row, issues[row.id] ?? []));
        } catch (error) {
          return errorReply(error, 'get_transaction_draft');
        }
      }
    );
  }
}
