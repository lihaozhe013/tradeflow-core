import express, { type Request, type Response, type Router } from 'express';
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

const router: Router = express.Router();
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
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

function errorResponse(res: Response, error: unknown): void {
  if (error instanceof DraftNotFoundError) {
    res.status(404).json({ success: false, code: 'DRAFT_NOT_FOUND' });
    return;
  }
  if (error instanceof DraftConflictError) {
    res.status(409).json({ success: false, code: error.code });
    return;
  }
  if (error instanceof Error && error.message === 'DRAFT_NOT_READY') {
    res.status(422).json({ success: false, code: 'DRAFT_NOT_READY', issues: (error as Error & { issues?: unknown[] }).issues ?? [] });
    return;
  }
  if (error instanceof Error && error.message === 'INVALID_REJECT_REASON') {
    res.status(400).json({ success: false, code: error.message });
    return;
  }
  const name = error instanceof Error ? error.name : 'UnknownError';
  logger.error('Transaction draft operation failed', { operation: res.req.method, errorName: name });
  res.status(500).json({ success: false, code: 'DRAFT_OPERATION_FAILED' });
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, code: 'INVALID_DRAFT_QUERY' });
    return;
  }
  if (
    parsed.data.startDate && parsed.data.endDate &&
    parsed.data.startDate > parsed.data.endDate
  ) {
    res.status(400).json({ success: false, code: 'INVALID_DRAFT_DATE_RANGE' });
    return;
  }
  const result = await listDrafts(parsed.data);
  const issues = await draftIssues(result.data);
  res.json({
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

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsedId = idSchema.safeParse(req.params['id']);
  if (!parsedId.success) {
    res.status(400).json({ success: false, code: 'INVALID_DRAFT_ID' });
    return;
  }
  const row = await findDraft(parsedId.data);
  if (!row) {
    res.status(404).json({ success: false, code: 'DRAFT_NOT_FOUND' });
    return;
  }
  const issues = await draftIssues([row]);
  res.json({ success: true, data: publicDraft(row, issues[row.id] ?? []) });
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  if (!getAuthConfig().enabled || !req.user || !['editor', 'superuser'].includes(req.user.role)) {
    res.status(!getAuthConfig().enabled ? 409 : 403).json({
      success: false,
      code: !getAuthConfig().enabled ? 'AUTH_REQUIRED' : 'INSUFFICIENT_PERMISSIONS'
    });
    return;
  }
  const parsedId = idSchema.safeParse(req.params['id']);
  const body = reviewSchema.safeParse(req.body);
  if (!parsedId.success || !body.success || !body.data.patch) {
    res.status(400).json({ success: false, code: 'INVALID_DRAFT_UPDATE' });
    return;
  }
  try {
    const result = await updateHumanDraft(
      parsedId.data,
      body.data.expectedVersion,
      body.data.patch,
      req.user.username
    );
    const issues = await draftIssues([result]);
    res.json({ success: true, data: publicDraft(result, issues[result.id] ?? []) });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  if (!getAuthConfig().enabled || !req.user || !['editor', 'superuser'].includes(req.user.role)) {
    res.status(!getAuthConfig().enabled ? 409 : 403).json({
      success: false,
      code: !getAuthConfig().enabled ? 'AUTH_REQUIRED' : 'INSUFFICIENT_PERMISSIONS'
    });
    return;
  }
  const parsedId = idSchema.safeParse(req.params['id']);
  const body = reviewSchema.safeParse(req.body);
  if (!parsedId.success || !body.success) {
    res.status(400).json({ success: false, code: 'INVALID_DRAFT_REVIEW' });
    return;
  }
  try {
    const result = await transitionDraft(
      parsedId.data,
      body.data.expectedVersion,
      'approved',
      req.user.username,
      body.data.patch
    );
    res.json({
      success: true,
      duplicate: result.duplicate,
      data: publicDraft(result.draft),
      formalRecordId: result.formalRecordId
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
  if (!getAuthConfig().enabled || !req.user || !['editor', 'superuser'].includes(req.user.role)) {
    res.status(!getAuthConfig().enabled ? 409 : 403).json({
      success: false,
      code: !getAuthConfig().enabled ? 'AUTH_REQUIRED' : 'INSUFFICIENT_PERMISSIONS'
    });
    return;
  }
  const parsedId = idSchema.safeParse(req.params['id']);
  const body = rejectSchema.safeParse(req.body);
  if (!parsedId.success || !body.success) {
    res.status(400).json({ success: false, code: 'INVALID_DRAFT_REJECTION' });
    return;
  }
  try {
    const result = await transitionDraft(
      parsedId.data,
      body.data.expectedVersion,
      'rejected',
      req.user.username,
      body.data.patch,
      body.data.reason
    );
    res.json({ success: true, data: publicDraft(result.draft) });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.use((_error: unknown, req: Request, res: Response, _next: (error?: unknown) => void) => {
  logger.error('Transaction draft request failed', {
    operation: req.method,
    errorName: _error instanceof Error ? _error.name : 'UnknownError'
  });
  res.status(500).json({ success: false, code: 'DRAFT_OPERATION_FAILED' });
});

export default router;
