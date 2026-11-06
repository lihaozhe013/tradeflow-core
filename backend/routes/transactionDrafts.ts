import { Hono } from 'hono';
import * as z from 'zod/v4';
import type { TransactionDraft } from '@/prisma/client';
import { getAuthConfig } from '@/utils/auth';
import { logger } from '@/utils/logger';
import {
  DraftConflictError,
  DraftNotFoundError,
  draftFieldsSchema,
  draftIssues,
  findDraft,
  listDrafts,
  transitionDraft,
  updateHumanDraft
} from '@/services/transactionDraftService';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

const directionSchema = z.enum(['inbound', 'outbound']);
const statusSchema = z.enum(['pending', 'approved', 'rejected']);
const idSchema = z.string().uuid();
const querySchema = z
  .object({
    direction: directionSchema.optional(),
    status: statusSchema.optional(),
    requestId: z.string().trim().min(1).max(128).optional(),
    partnerCode: z.string().trim().min(1).max(100).optional(),
    productCode: z.string().trim().min(1).max(100).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();
const reviewSchema = z
  .object({ expectedVersion: z.number().int().positive(), patch: draftFieldsSchema.optional() })
  .strict();
const rejectSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
    patch: draftFieldsSchema.optional()
  })
  .strict();

function publicDraft(row: TransactionDraft, issues: unknown[] = []) {
  const first = row.first_payload as { direction?: unknown; record?: unknown } | null;
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
    original: first?.record ?? null,
    source: {
      kind: row.submission_key.startsWith('static:') ? 'static' : 'account',
      id: row.source_id
    },
    source_connection_id: row.source_connection_id,
    last_modified_by: row.last_modified_by,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    reject_reason: row.reject_reason,
    approved_record_id: row.approved_record_id,
    request_id: row.request_id,
    row_index: row.row_index,
    created_at: row.created_at,
    updated_at: row.updated_at,
    issues
  };
}

function errorResponse(c: any, error: unknown): Response {
  if (error instanceof DraftNotFoundError) {
    return c.json({ success: false, code: 'DRAFT_NOT_FOUND' }, 404);
  }
  if (error instanceof DraftConflictError) {
    return c.json({ success: false, code: error.code }, 409);
  }
  if (error instanceof Error && error.message === 'DRAFT_NOT_READY') {
    return c.json(
      {
        success: false,
        code: 'DRAFT_NOT_READY',
        issues: (error as Error & { issues?: unknown[] }).issues ?? []
      },
      422
    );
  }
  if (error instanceof Error && error.message === 'INVALID_REJECT_REASON') {
    return c.json({ success: false, code: error.message }, 400);
  }
  const name = error instanceof Error ? error.name : 'UnknownError';
  logger.error('Transaction draft operation failed', { operation: c.req.method, errorName: name });
  return c.json({ success: false, code: 'DRAFT_OPERATION_FAILED' }, 500);
}

app.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, code: 'INVALID_DRAFT_QUERY' }, 400);
  }
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.startDate > parsed.data.endDate) {
    return c.json({ success: false, code: 'INVALID_DRAFT_DATE_RANGE' }, 400);
  }
  const result = await listDrafts(parsed.data);
  const issues = await draftIssues(result.data);
  return c.json({
    success: true,
    reviewEnabled: getAuthConfig().enabled,
    data: result.data.map((row) => publicDraft(row, issues[row.id] ?? [])),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages
    }
  });
});

app.get('/:id', async (c) => {
  const parsedId = idSchema.safeParse(c.req.param('id'));
  if (!parsedId.success) {
    return c.json({ success: false, code: 'INVALID_DRAFT_ID' }, 400);
  }
  const row = await findDraft(parsedId.data);
  if (!row) {
    return c.json({ success: false, code: 'DRAFT_NOT_FOUND' }, 404);
  }
  const issues = await draftIssues([row]);
  return c.json({ success: true, data: publicDraft(row, issues[row.id] ?? []) });
});

app.patch('/:id', async (c) => {
  const user = c.get('user');
  if (!getAuthConfig().enabled || !user || !['editor', 'superuser'].includes(user.role)) {
    return c.json(
      {
        success: false,
        code: !getAuthConfig().enabled ? 'AUTH_REQUIRED' : 'INSUFFICIENT_PERMISSIONS'
      },
      !getAuthConfig().enabled ? 409 : 403
    );
  }
  const parsedId = idSchema.safeParse(c.req.param('id'));
  let bodyJson: unknown;
  try {
    bodyJson = await c.req.json();
  } catch {
    bodyJson = {};
  }
  const body = reviewSchema.safeParse(bodyJson);
  if (!parsedId.success || !body.success || !body.data.patch) {
    return c.json({ success: false, code: 'INVALID_DRAFT_UPDATE' }, 400);
  }
  try {
    const result = await updateHumanDraft(
      parsedId.data,
      body.data.expectedVersion,
      body.data.patch,
      user.username
    );
    const issues = await draftIssues([result]);
    return c.json({ success: true, data: publicDraft(result, issues[result.id] ?? []) });
  } catch (error) {
    return errorResponse(c, error);
  }
});

app.post('/:id/approve', async (c) => {
  const user = c.get('user');
  if (!getAuthConfig().enabled || !user || !['editor', 'superuser'].includes(user.role)) {
    return c.json(
      {
        success: false,
        code: !getAuthConfig().enabled ? 'AUTH_REQUIRED' : 'INSUFFICIENT_PERMISSIONS'
      },
      !getAuthConfig().enabled ? 409 : 403
    );
  }
  const parsedId = idSchema.safeParse(c.req.param('id'));
  let bodyJson: unknown;
  try {
    bodyJson = await c.req.json();
  } catch {
    bodyJson = {};
  }
  const body = reviewSchema.safeParse(bodyJson);
  if (!parsedId.success || !body.success) {
    return c.json({ success: false, code: 'INVALID_DRAFT_REVIEW' }, 400);
  }
  try {
    const result = await transitionDraft(
      parsedId.data,
      body.data.expectedVersion,
      'approved',
      user.username,
      body.data.patch
    );
    return c.json({
      success: true,
      duplicate: result.duplicate,
      data: publicDraft(result.draft),
      formalRecordId: result.formalRecordId
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

app.post('/:id/reject', async (c) => {
  const user = c.get('user');
  if (!getAuthConfig().enabled || !user || !['editor', 'superuser'].includes(user.role)) {
    return c.json(
      {
        success: false,
        code: !getAuthConfig().enabled ? 'AUTH_REQUIRED' : 'INSUFFICIENT_PERMISSIONS'
      },
      !getAuthConfig().enabled ? 409 : 403
    );
  }
  const parsedId = idSchema.safeParse(c.req.param('id'));
  let bodyJson: unknown;
  try {
    bodyJson = await c.req.json();
  } catch {
    bodyJson = {};
  }
  const body = rejectSchema.safeParse(bodyJson);
  if (!parsedId.success || !body.success) {
    return c.json({ success: false, code: 'INVALID_DRAFT_REJECTION' }, 400);
  }
  try {
    const result = await transitionDraft(
      parsedId.data,
      body.data.expectedVersion,
      'rejected',
      user.username,
      body.data.patch,
      body.data.reason
    );
    return c.json({ success: true, data: publicDraft(result.draft) });
  } catch (error) {
    return errorResponse(c, error);
  }
});

export default app;
