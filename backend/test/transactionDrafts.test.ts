import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent } from '@/test/helpers/request';
import { DraftNotFoundError, submitDraftBatch, updateDraft } from '@/services/transactionDraftService';

const source = {
  scopeKey: 'account:test_editor',
  sourceId: 'draft-review-test',
  ownerUsername: 'test_editor',
  connectionId: randomUUID(),
  actor: 'test_editor'
};

let supplierCode = '';
let customerCode = '';
let productCode = '';
let productModel = '';
let overflowProductCode = '';
let overflowProductModel = '';
const draftIds: string[] = [];

beforeAll(async () => {
  const [supplier, customer] = await Promise.all([
    prisma.partner.findFirst({ where: { type: 0 }, select: { code: true } }),
    prisma.partner.findFirst({ where: { type: 1 }, select: { code: true } })
  ]);
  if (!supplier || !customer) throw new Error('Seeded supplier and customer are required');
  supplierCode = supplier.code;
  customerCode = customer.code;

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  productCode = `DRAFT-${suffix}`;
  productModel = `DRAFT-MODEL-${suffix}`;
  overflowProductCode = `DRAFT-OVERFLOW-${suffix}`;
  overflowProductModel = `DRAFT-OVERFLOW-MODEL-${suffix}`;
  await prisma.product.createMany({
    data: [
      { code: productCode, product_model: productModel },
      { code: overflowProductCode, product_model: overflowProductModel }
    ]
  });
});

afterAll(async () => {
  await prisma.transactionDraft.deleteMany({ where: { id: { in: draftIds } } });
  await prisma.inboundRecord.deleteMany({ where: { product_code: { in: [productCode, overflowProductCode] } } });
  await prisma.outboundRecord.deleteMany({ where: { product_code: productCode } });
  await prisma.inventoryLedger.deleteMany({
    where: { product_model: { in: [productModel, overflowProductModel] } }
  });
  await prisma.inventory.deleteMany({
    where: { product_model: { in: [productModel, overflowProductModel] } }
  });
  await prisma.product.deleteMany({ where: { code: { in: [productCode, overflowProductCode] } } });
});

describe('transaction draft staging and review', () => {
  it('keeps incomplete MCP submissions out of formal records and enforces source and version boundaries', async () => {
    const requestId = `draft-${randomUUID()}`;
    const beforeCount = await prisma.inboundRecord.count();
    const submitted = await submitDraftBatch(
      'inbound',
      requestId,
      [{ partner_text: 'Supplier awaiting match', product_text: 'Widget', quantity: 3, unit_price: 2.5 }],
      source
    );
    const draft = submitted.data[0]!;
    draftIds.push(draft.id);

    const retry = await submitDraftBatch(
      'inbound',
      requestId,
      [{ partner_text: 'Supplier awaiting match', product_text: 'Widget', quantity: 3, unit_price: 2.5 }],
      { ...source, sourceId: 'another-connection', connectionId: randomUUID() }
    );
    expect(retry.duplicate).toBe(true);
    expect(retry.data.map((row) => row.id)).toEqual([draft.id]);
    await expect(
      submitDraftBatch(
        'inbound',
        requestId,
        [{ partner_text: 'Changed payload', quantity: 3 }],
        source
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const otherAccountSource = {
      ...source,
      scopeKey: 'account:test_reader',
      sourceId: 'other-account',
      ownerUsername: 'test_reader',
      actor: 'test_reader'
    };
    const otherDraft = await submitDraftBatch(
      'inbound',
      `other-${randomUUID()}`,
      [{ product_text: 'Private row' }],
      otherAccountSource
    );
    draftIds.push(otherDraft.data[0]!.id);
    expect(await prisma.transactionDraft.findFirst({ where: { id: draft.id } })).toMatchObject({
      status: 'pending',
      version: 1
    });
    expect(await prisma.inboundRecord.count()).toBe(beforeCount);
    expect(await prisma.inventory.findUnique({ where: { product_model: productModel } })).toBeNull();
    expect(await prisma.inventoryLedger.count({ where: { product_model: productModel } })).toBe(0);

    await expect(
      updateDraft(draft.id, 1, { remark: 'cross-account change' }, otherAccountSource)
    ).rejects.toBeInstanceOf(DraftNotFoundError);

    const reader = await authAgent('reader');
    expect((await reader.get(`/api/transaction-drafts/${draft.id}`)).status).toBe(200);
    expect(
      (await reader.patch(`/api/transaction-drafts/${draft.id}`).send({
        expectedVersion: 1,
        patch: { remark: 'reader cannot edit' }
      })).status
    ).toBe(403);

    const editor = await authAgent('editor');
    const saved = await editor.patch(`/api/transaction-drafts/${draft.id}`).send({
      expectedVersion: 1,
      patch: {
        partner_code: supplierCode,
        product_code: productCode,
        quantity: 3,
        unit_price: 2.5,
        transaction_date: '2026-10-01'
      }
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.version).toBe(2);
    expect(saved.body.data).toMatchObject({
      source: { kind: 'account', id: source.sourceId },
      original: expect.any(Object),
      issues: expect.any(Array)
    });
    expect(
      (
        await editor.patch(`/api/transaction-drafts/${draft.id}`).send({
          expectedVersion: 1,
          patch: { remark: 'stale client' }
        })
      ).status
    ).toBe(409);

    const approvals = await Promise.all([
      editor.post(`/api/transaction-drafts/${draft.id}/approve`).send({ expectedVersion: 2 }),
      editor.post(`/api/transaction-drafts/${draft.id}/approve`).send({ expectedVersion: 2 })
    ]);
    expect(approvals.map((response) => response.status)).toEqual([200, 200]);
    const formalId = approvals[0]!.body.formalRecordId as number;
    expect(approvals[1]!.body.formalRecordId).toBe(formalId);
    expect(approvals.filter((response) => response.body.duplicate === false)).toHaveLength(1);
    expect(approvals.filter((response) => response.body.duplicate === true)).toHaveLength(1);

    const inbound = await prisma.inboundRecord.findMany({ where: { product_code: productCode } });
    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({ id: formalId, quantity: 3, total_price: 7.5 });
    expect(await prisma.inventory.findUnique({ where: { product_model: productModel } })).toMatchObject({
      quantity: 3
    });
    expect(await prisma.inventoryLedger.findMany({ where: { product_model: productModel } })).toMatchObject([
      { change_qty: 3, change_type: 'INBOUND', reference_id: formalId }
    ]);

    const outbound = await submitDraftBatch(
      'outbound',
      `out-${randomUUID()}`,
      [{
        partner_code: customerCode,
        product_code: productCode,
        quantity: 2,
        unit_price: 4.25,
        transaction_date: '2026-10-02'
      }],
      source
    );
    draftIds.push(outbound.data[0]!.id);
    const outboundApproval = await editor
      .post(`/api/transaction-drafts/${outbound.data[0]!.id}/approve`)
      .send({ expectedVersion: 1 });
    expect(outboundApproval.status).toBe(200);
    const outboundId = outboundApproval.body.formalRecordId as number;
    expect(
      await prisma.outboundRecord.findUnique({ where: { id: outboundId } })
    ).toMatchObject({ quantity: 2, total_price: 8.5 });
    expect(await prisma.inventory.findUnique({ where: { product_model: productModel } })).toMatchObject({
      quantity: 1
    });
    expect(
      (await prisma.inventoryLedger.findMany({ where: { product_model: productModel } }))
        .map((entry) => entry.change_qty)
        .sort((left, right) => left - right)
    ).toEqual([-2, 3]);
  });

  it('rolls back a formal inbound and ledger when the inventory write fails', async () => {
    await prisma.inventory.create({
      data: { product_model: overflowProductModel, quantity: 2_147_483_647 }
    });
    const created = await submitDraftBatch(
      'inbound',
      `rollback-${randomUUID()}`,
      [{
        partner_code: supplierCode,
        product_code: overflowProductCode,
        quantity: 1,
        unit_price: 1,
        transaction_date: '2026-10-03'
      }],
      source
    );
    const draft = created.data[0]!;
    draftIds.push(draft.id);
    const editor = await authAgent('editor');
    const response = await editor
      .post(`/api/transaction-drafts/${draft.id}/approve`)
      .send({ expectedVersion: 1 });

    expect(response.status).toBe(500);
    expect(await prisma.inboundRecord.count({ where: { product_code: overflowProductCode } })).toBe(0);
    expect(await prisma.inventoryLedger.count({ where: { product_model: overflowProductModel } })).toBe(
      0
    );
    expect(await prisma.inventory.findUnique({ where: { product_model: overflowProductModel } })).toMatchObject({
      quantity: 2_147_483_647
    });
    expect(await prisma.transactionDraft.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'pending',
      version: 1
    });
  });
});
