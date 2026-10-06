import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import type { Prisma, PrismaClient } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import { createInboundRecord, createOutboundRecord } from '@/services/transactionWriteService';

export type TransactionDirection = 'inbound' | 'outbound';
export type DraftStatus = 'pending' | 'approved' | 'rejected';
export type DraftDatabase = PrismaClient | Prisma.TransactionClient;

const optionalText = (maximum = 250) => z.string().trim().max(maximum).nullable().optional();
const optionalInteger = z.number().int().min(-2_147_483_648).max(2_147_483_647).nullable().optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
    } catch {
      return false;
    }
  });

export const draftFieldsSchema = z
  .object({
    partner_code: optionalText(100),
    partner_text: optionalText(),
    product_code: optionalText(100),
    product_text: optionalText(),
    quantity: optionalInteger,
    unit_price: z.number().finite().nullable().optional(),
    transaction_date: isoDate.nullable().optional(),
    invoice_date: isoDate.nullable().optional(),
    invoice_number: optionalText(250),
    receipt_number: optionalText(250),
    order_number: optionalText(250),
    remark: optionalText(2000)
  })
  .strict();

export type DraftFields = z.infer<typeof draftFieldsSchema>;

export const draftSourceSchema = z.object({
  scopeKey: z.string().min(1).max(200),
  sourceId: z.string().min(1).max(100),
  ownerUsername: z.string().max(100).nullable(),
  connectionId: z.string().uuid().nullable(),
  actor: z.string().min(1).max(150)
});

export type DraftSource = z.infer<typeof draftSourceSchema>;

export interface DraftIssue {
  code: string;
  field: string;
}

export interface DraftRow {
  id: string;
  direction: string;
  status: string;
  version: number;
  partner_code: string | null;
  partner_text: string | null;
  product_code: string | null;
  product_text: string | null;
  quantity: number | null;
  unit_price: number | null;
  transaction_date: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  receipt_number: string | null;
  order_number: string | null;
  remark: string | null;
  first_payload: Prisma.JsonValue;
  payload_hash: string;
  submission_key: string;
  request_id: string;
  row_index: number;
  owner_username: string | null;
  source_id: string;
  source_connection_id: string | null;
  last_modified_by: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  reject_reason: string | null;
  approved_record_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export class DraftConflictError extends Error {
  constructor(readonly code: 'VERSION_CONFLICT' | 'DRAFT_NOT_PENDING' | 'IDEMPOTENCY_CONFLICT') {
    super(code);
  }
}

export class DraftNotFoundError extends Error {
  constructor() {
    super('DRAFT_NOT_FOUND');
  }
}

const payloadFields = [
  'partner_code',
  'partner_text',
  'product_code',
  'product_text',
  'quantity',
  'unit_price',
  'transaction_date',
  'invoice_date',
  'invoice_number',
  'receipt_number',
  'order_number',
  'remark'
] as const satisfies readonly (keyof DraftFields)[];

function pickFields(input: DraftFields): DraftFields {
  return Object.fromEntries(
    payloadFields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]])
  ) as DraftFields;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function auditParams(details: Record<string, unknown>): string {
  return JSON.stringify(details);
}

async function writeAudit(
  db: Prisma.TransactionClient,
  actor: string,
  action: string,
  id: string,
  details: Record<string, unknown>
): Promise<void> {
  await db.systemLog.create({
    data: {
      username: actor,
      action,
      resource: `/transaction-drafts/${id}`,
      user_agent: '',
      params: auditParams(details)
    }
  });
}

function draftCreateData(
  direction: TransactionDirection,
  fields: DraftFields,
  source: DraftSource,
  requestId: string,
  rowIndex: number,
  payloadHash: string,
  original: Prisma.InputJsonValue
): Prisma.TransactionDraftCreateManyInput {
  return {
    direction,
    ...pickFields(fields),
    first_payload: original,
    payload_hash: payloadHash,
    submission_key: source.scopeKey,
    request_id: requestId,
    row_index: rowIndex,
    owner_username: source.ownerUsername,
    source_id: source.sourceId,
    source_connection_id: source.connectionId,
    last_modified_by: source.actor
  };
}

function hasUsefulData(fields: DraftFields): boolean {
  return payloadFields.some((key) => {
    const value = fields[key];
    return value !== undefined && value !== null && (typeof value !== 'string' || value.length > 0);
  });
}

function sourceWhere(scopeKey: string) {
  if (scopeKey.startsWith('account:')) {
    return { submission_key: scopeKey, owner_username: scopeKey.slice('account:'.length) };
  }
  return { submission_key: scopeKey, owner_username: null };
}

export async function submitDraftBatch(
  direction: TransactionDirection,
  requestId: string,
  records: DraftFields[],
  source: DraftSource
): Promise<{ data: DraftRow[]; duplicate: boolean }> {
  const parsedSource = draftSourceSchema.parse(source);
  const parsedRecords = records.map((record) => draftFieldsSchema.parse(record));
  if (!parsedRecords.length || parsedRecords.length > 100 || parsedRecords.some((item) => !hasUsefulData(item))) {
    throw new Error('INVALID_DRAFT_BATCH');
  }
  const payloadHash = hash({ direction, records: parsedRecords.map(pickFields) });
  const data = parsedRecords.map((record, index) =>
    draftCreateData(
      direction,
      record,
      parsedSource,
      requestId,
      index,
      payloadHash,
      { direction, record } as Prisma.InputJsonValue
    )
  );

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.transactionDraft.createMany({ data });
      const rows = await tx.transactionDraft.findMany({
        where: { submission_key: parsedSource.scopeKey, request_id: requestId },
        orderBy: { row_index: 'asc' }
      });
      for (const row of rows) {
        await writeAudit(tx, parsedSource.actor, 'DRAFT_CREATE', row.id, {
          version: row.version,
          direction,
          requestId,
          rowIndex: row.row_index,
          sourceId: parsedSource.sourceId,
          submissionKey: parsedSource.scopeKey,
          sourceConnectionId: parsedSource.connectionId,
          payload: parsedRecords[row.row_index]
        });
      }
      return { data: rows, duplicate: false };
    });
  } catch (error) {
    const existing = await prisma.transactionDraft.findMany({
      where: { ...sourceWhere(parsedSource.scopeKey), request_id: requestId },
      orderBy: { row_index: 'asc' }
    });
    if (!existing.length) throw error;
    if (
      existing.length !== parsedRecords.length ||
      existing.some((row) => row.payload_hash !== payloadHash)
    ) {
      throw new DraftConflictError('IDEMPOTENCY_CONFLICT');
    }
    return { data: existing, duplicate: true };
  }
}

export async function findDraft(
  id: string,
  submissionKey?: string,
  db: DraftDatabase = prisma
): Promise<DraftRow | null> {
  return db.transactionDraft.findFirst({
    where: { id, ...(submissionKey ? sourceWhere(submissionKey) : {}) }
  });
}

export async function listDrafts(
  args: {
    direction?: TransactionDirection;
    status?: DraftStatus;
    requestId?: string;
    partnerCode?: string;
    productCode?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  },
  submissionKey?: string,
  db: DraftDatabase = prisma
): Promise<{ data: DraftRow[]; total: number; page: number; limit: number; pages: number }> {
  const where = {
    ...(args.direction ? { direction: args.direction } : {}),
    ...(args.status ? { status: args.status } : {}),
    ...(args.requestId ? { request_id: args.requestId } : {}),
    ...(args.partnerCode ? { partner_code: { contains: args.partnerCode, mode: 'insensitive' as const } } : {}),
    ...(args.productCode ? { product_code: { contains: args.productCode, mode: 'insensitive' as const } } : {}),
    ...(args.startDate || args.endDate
      ? {
          transaction_date: {
            ...(args.startDate ? { gte: args.startDate } : {}),
            ...(args.endDate ? { lte: args.endDate } : {})
          }
        }
      : {}),
    ...(submissionKey ? sourceWhere(submissionKey) : {})
  };
  const [data, total] = await Promise.all([
    db.transactionDraft.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { row_index: 'asc' }],
      skip: (args.page - 1) * args.limit,
      take: args.limit
    }),
    db.transactionDraft.count({ where })
  ]);
  return { data, total, page: args.page, limit: args.limit, pages: Math.ceil(total / args.limit) };
}

export async function updateDraft(
  id: string,
  expectedVersion: number,
  patch: DraftFields,
  source: DraftSource
): Promise<DraftRow> {
  const parsedPatch = draftFieldsSchema.parse(patch);
  const parsedSource = draftSourceSchema.parse(source);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DraftRow[]>`
      SELECT * FROM transaction_drafts
      WHERE id = ${id}
        AND submission_key = ${parsedSource.scopeKey}
        AND owner_username IS NOT DISTINCT FROM ${parsedSource.ownerUsername}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new DraftNotFoundError();
    if (current.status !== 'pending') throw new DraftConflictError('DRAFT_NOT_PENDING');
    if (current.version !== expectedVersion) throw new DraftConflictError('VERSION_CONFLICT');
    const data = pickFields(parsedPatch);
    const updated = await tx.transactionDraft.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
        last_modified_by: parsedSource.actor
      }
    });
    await writeAudit(tx, parsedSource.actor, 'DRAFT_UPDATE', id, {
      fromVersion: current.version,
      toVersion: updated.version,
      sourceId: current.source_id,
      submissionKey: current.submission_key,
      sourceConnectionId: current.source_connection_id,
      requestId: current.request_id,
      rowIndex: current.row_index,
      patch: data
    });
    return updated;
  });
}

export async function updateHumanDraft(
  id: string,
  expectedVersion: number,
  patch: DraftFields,
  actor: string
): Promise<DraftRow> {
  const parsedPatch = draftFieldsSchema.parse(patch);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DraftRow[]>`
      SELECT * FROM transaction_drafts WHERE id = ${id} FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new DraftNotFoundError();
    if (current.status !== 'pending') throw new DraftConflictError('DRAFT_NOT_PENDING');
    if (current.version !== expectedVersion) throw new DraftConflictError('VERSION_CONFLICT');
    const data = pickFields(parsedPatch);
    const updated = await tx.transactionDraft.update({
      where: { id },
      data: { ...data, version: { increment: 1 }, last_modified_by: actor }
    });
    await writeAudit(tx, actor, 'DRAFT_UPDATE', id, {
      fromVersion: current.version,
      toVersion: updated.version,
      sourceId: current.source_id,
      submissionKey: current.submission_key,
      sourceConnectionId: current.source_connection_id,
      requestId: current.request_id,
      rowIndex: current.row_index,
      patch: data
    });
    return updated;
  });
}

export async function transitionDraft(
  id: string,
  expectedVersion: number,
  transition: 'approved' | 'rejected',
  actor: string,
  finalPatch?: DraftFields,
  rejectReason?: string
): Promise<{ draft: DraftRow; formalRecordId?: number; duplicate: boolean }> {
  const patch = finalPatch ? draftFieldsSchema.parse(finalPatch) : {};
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DraftRow[]>`
      SELECT * FROM transaction_drafts WHERE id = ${id} FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new DraftNotFoundError();
    if (current.status === transition && transition === 'approved' && current.approved_record_id) {
      return { draft: current, formalRecordId: current.approved_record_id, duplicate: true };
    }
    if (current.status !== 'pending') throw new DraftConflictError('DRAFT_NOT_PENDING');
    if (current.version !== expectedVersion) throw new DraftConflictError('VERSION_CONFLICT');

    const values = { ...current, ...pickFields(patch) };
    if (transition === 'rejected') {
      const reason = rejectReason?.trim();
      if (!reason || reason.length > 2000) throw new Error('INVALID_REJECT_REASON');
      const draft = await tx.transactionDraft.update({
        where: { id },
        data: {
          ...pickFields(patch),
          status: 'rejected',
          version: { increment: 1 },
          last_modified_by: actor,
          reviewed_by: actor,
          reviewed_at: new Date(),
          reject_reason: reason
        }
      });
      await writeAudit(tx, actor, 'DRAFT_REJECT', id, {
        fromVersion: current.version,
        toVersion: draft.version,
        sourceId: current.source_id,
        submissionKey: current.submission_key,
        sourceConnectionId: current.source_connection_id,
        requestId: current.request_id,
        rowIndex: current.row_index,
        reason,
        patch
      });
      return { draft, duplicate: false };
    }

    const resolved = await resolveDraft(tx, values);
    if (resolved.issues.length) {
      const error = new Error('DRAFT_NOT_READY');
      Object.assign(error, { issues: resolved.issues });
      throw error;
    }

    const quantity = values.quantity!;
    const unitPrice = values.unit_price!;
    let formalRecordId: number;
    if (values.direction === 'inbound') {
      const formal = await createInboundRecord(tx, {
              supplier_code: values.partner_code!,
              product_code: values.product_code,
              quantity,
              unit_price: unitPrice,
              inbound_date: values.transaction_date,
              invoice_date: values.invoice_date,
              invoice_number: values.invoice_number,
              receipt_number: values.receipt_number,
              order_number: values.order_number,
              remark: values.remark
            });
      formalRecordId = formal.id;
    } else {
      const formal = await createOutboundRecord(tx, {
              customer_code: values.partner_code!,
              product_code: values.product_code,
              quantity,
              unit_price: unitPrice,
              outbound_date: values.transaction_date,
              invoice_date: values.invoice_date,
              invoice_number: values.invoice_number,
              receipt_number: values.receipt_number,
              order_number: values.order_number,
              remark: values.remark
            });
      formalRecordId = formal.id;
    }

    const draft = await tx.transactionDraft.update({
      where: { id },
      data: {
        ...pickFields(patch),
        status: 'approved',
        version: { increment: 1 },
        last_modified_by: actor,
        reviewed_by: actor,
        reviewed_at: new Date(),
        approved_record_id: formalRecordId
      }
    });
    await writeAudit(tx, actor, 'DRAFT_APPROVE', id, {
      fromVersion: current.version,
      toVersion: draft.version,
      direction: values.direction,
      formalRecordId,
      sourceId: current.source_id,
      submissionKey: current.submission_key,
      sourceConnectionId: current.source_connection_id,
      requestId: current.request_id,
      rowIndex: current.row_index,
      patch
    });
    return { draft, formalRecordId, duplicate: false };
  });
}

async function resolveDraft(db: DraftDatabase, draft: DraftRow): Promise<{ issues: DraftIssue[] }> {
  const issues: DraftIssue[] = [];
  if (draft.direction !== 'inbound' && draft.direction !== 'outbound') {
    issues.push({ code: 'invalid_direction', field: 'direction' });
  }
  if (!draft.partner_code) issues.push({ code: 'partner_required', field: 'partner_code' });
  if (!draft.product_code) issues.push({ code: 'product_required', field: 'product_code' });
  if (draft.quantity === null || draft.quantity === undefined) {
    issues.push({ code: 'quantity_required', field: 'quantity' });
  }
  if (draft.unit_price === null || draft.unit_price === undefined || !Number.isFinite(draft.unit_price)) {
    issues.push({ code: 'unit_price_required', field: 'unit_price' });
  }
  if (!draft.transaction_date) issues.push({ code: 'date_required', field: 'transaction_date' });

  const expectedType = draft.direction === 'inbound' ? 0 : 1;
  if (draft.partner_code) {
    const partner = await db.partner.findUnique({
      where: { code: draft.partner_code },
      select: { type: true }
    });
    if (!partner) issues.push({ code: 'partner_unmatched', field: 'partner_code' });
    else if (partner.type !== expectedType) issues.push({ code: 'partner_type_mismatch', field: 'partner_code' });
  }
  if (draft.product_code) {
    const product = await db.product.findUnique({
      where: { code: draft.product_code },
      select: { code: true }
    });
    if (!product) issues.push({ code: 'product_unmatched', field: 'product_code' });
  }
  return { issues };
}

export async function draftIssues(rows: DraftRow[], db: DraftDatabase = prisma): Promise<Record<string, DraftIssue[]>> {
  const partnerCodes = [...new Set(rows.map((row) => row.partner_code).filter((value): value is string => !!value))];
  const productCodes = [...new Set(rows.map((row) => row.product_code).filter((value): value is string => !!value))];
  const [partners, products] = await Promise.all([
    partnerCodes.length ? db.partner.findMany({ where: { code: { in: partnerCodes } }, select: { code: true, type: true } }) : [],
    productCodes.length ? db.product.findMany({ where: { code: { in: productCodes } }, select: { code: true } }) : []
  ]);
  const partnerByCode = new Map(partners.map((partner) => [partner.code, partner.type]));
  const productSet = new Set(products.map((product) => product.code));
  const result: Record<string, DraftIssue[]> = {};
  for (const row of rows) {
    const issues: DraftIssue[] = [];
    if (!row.partner_code) issues.push({ code: 'partner_required', field: 'partner_code' });
    else if (!partnerByCode.has(row.partner_code)) issues.push({ code: 'partner_unmatched', field: 'partner_code' });
    else if (partnerByCode.get(row.partner_code) !== (row.direction === 'inbound' ? 0 : 1)) {
      issues.push({ code: 'partner_type_mismatch', field: 'partner_code' });
    }
    if (!row.product_code) issues.push({ code: 'product_required', field: 'product_code' });
    else if (!productSet.has(row.product_code)) issues.push({ code: 'product_unmatched', field: 'product_code' });
    if (row.quantity === null) issues.push({ code: 'quantity_required', field: 'quantity' });
    if (row.unit_price === null) issues.push({ code: 'unit_price_required', field: 'unit_price' });
    if (!row.transaction_date) issues.push({ code: 'date_required', field: 'transaction_date' });
    result[row.id] = issues;
  }
  return result;
}

export function prismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export { hash as hashDraftPayload };
