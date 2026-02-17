import { prisma } from '@/prismaClient';
import { Prisma } from '@prisma/client';

export type ChangeType = 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT';

export const inventoryService = {
  /**
   * Get all inventory (like getAllInventoryData from cache service)
   */
  async getAllInventory() {
    return await prisma.inventory.findMany({
      orderBy: { product_model: 'asc' },
    });
  },

  /**
   * Full recalculation of inventory and ledger from scratch.
   * Clears existing inventory/ledger data and rebuilds from inbound/outbound records.
   */
  async recalculateAll() {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Clear tables
        await tx.inventory.deleteMany({});
        await tx.inventoryLedger.deleteMany({});

        // 2. Fetch all records
        const inbounds = await tx.inboundRecord.findMany({ orderBy: { inbound_date: 'asc' } });
        const outbounds = await tx.outboundRecord.findMany({ orderBy: { outbound_date: 'asc' } });

        // 3. Create events timeline
        const events: Array<{
          date: string;
          type: ChangeType;
          qty: number;
          model: string;
          refId: number;
        }> = [];

        for (const r of inbounds) {
          if (!r.product_model || !r.quantity) continue;
          events.push({
            date: r.inbound_date || new Date().toISOString(),
            type: 'INBOUND',
            qty: r.quantity,
            model: r.product_model,
            refId: r.id,
          });
        }

        for (const r of outbounds) {
          if (!r.product_model || !r.quantity) continue;
          events.push({
            date: r.outbound_date || new Date().toISOString(),
            type: 'OUTBOUND',
            qty: -r.quantity, // Negative for outbound
            model: r.product_model,
            refId: r.id,
          });
        }

        // Sort by date used for ledger ordering (though strictly not required for sum)
        events.sort((a, b) => {
          return a.date.localeCompare(b.date);
        });

        // 4. Process events
        // For ledger: insert all
        // For inventory: track current totals
        const totals: Record<string, number> = {};
        const ledgerData = events.map((e) => {
          totals[e.model] = (totals[e.model] || 0) + e.qty;
          return {
            product_model: e.model,
            change_qty: e.qty,
            change_type: e.type,
            reference_id: e.refId,
            date: e.date,
          };
        });

        // Batch insert logic to avoid too large query params if many records
        // But typically manageable.
        if (ledgerData.length > 0) {
          // Chunk it if necessary, but assuming <10k records for "small business"
          await tx.inventoryLedger.createMany({ data: ledgerData });
        }

        // 5. Update inventory table
        const invData = Object.entries(totals).map(([model, qty]) => ({
          product_model: model,
          quantity: qty,
        }));

        if (invData.length > 0) {
          await tx.inventory.createMany({ data: invData });
        }

        return {
          processed_events: ledgerData.length,
          products_count: invData.length,
        };
      },
      {
        timeout: 20000, // Increase timeout for full recalc
      },
    );
  },

  /**
   * Handle Inbound Create
   */
  async onInboundCreate(record: Prisma.InboundRecordGetPayload<{}>) {
    if (!record.product_model || !record.quantity) return;
    await prisma.$transaction(async (tx) => {
      await tx.inventoryLedger.create({
        data: {
          product_model: record.product_model!,
          change_qty: record.quantity!,
          change_type: 'INBOUND',
          reference_id: record.id,
          date: record.inbound_date || new Date().toISOString(),
        },
      });
      await tx.inventory.upsert({
        where: { product_model: record.product_model! },
        update: { quantity: { increment: record.quantity! } },
        create: { product_model: record.product_model!, quantity: record.quantity! },
      });
    });
  },

  /**
   * Handle Outbound Create
   */
  async onOutboundCreate(record: Prisma.OutboundRecordGetPayload<{}>) {
    if (!record.product_model || !record.quantity) return;
    await prisma.$transaction(async (tx) => {
      // Ledger stores negative qty for outbound? Or stores positive number with type OUTBOUND?
      // User query example: SELECT SUM(Change_Qty).
      // So for outbound, Change_Qty should be negative.
      const changeQty = -record.quantity!;

      await tx.inventoryLedger.create({
        data: {
          product_model: record.product_model!,
          change_qty: changeQty,
          change_type: 'OUTBOUND',
          reference_id: record.id,
          date: record.outbound_date || new Date().toISOString(),
        },
      });
      await tx.inventory.upsert({
        where: { product_model: record.product_model! },
        update: { quantity: { increment: changeQty } },
        create: { product_model: record.product_model!, quantity: changeQty },
      });
    });
  },

  /**
   * Handle Inbound Delete
   */
  async onInboundDelete(id: number) {
    // Ideally pass the record if available to avoid refetch, but we need to match Ledger anyway
    await prisma.$transaction(async (tx) => {
      const entries = await tx.inventoryLedger.findMany({
        where: { reference_id: id, change_type: 'INBOUND' },
      });

      for (const entry of entries) {
        // Revert inventory (decrement the added qty)
        await tx.inventory.upsert({
          where: { product_model: entry.product_model },
          update: { quantity: { decrement: entry.change_qty } },
          create: { product_model: entry.product_model, quantity: -entry.change_qty },
        });
      }
      await tx.inventoryLedger.deleteMany({
        where: { reference_id: id, change_type: 'INBOUND' },
      });
    });
  },

  /**
   * Handle Outbound Delete
   */
  async onOutboundDelete(id: number) {
    await prisma.$transaction(async (tx) => {
      const entries = await tx.inventoryLedger.findMany({
        where: { reference_id: id, change_type: 'OUTBOUND' },
      });

      for (const entry of entries) {
        // Revert inventory (subtract the negative change -> add back)
        await tx.inventory.upsert({
          where: { product_model: entry.product_model },
          update: { quantity: { decrement: entry.change_qty } }, // change_qty is negative, so decrementing negative adds it back
          create: { product_model: entry.product_model, quantity: -entry.change_qty },
        });
      }
      await tx.inventoryLedger.deleteMany({
        where: { reference_id: id, change_type: 'OUTBOUND' },
      });
    });
  },

  /**
   * Handle Inbound Update
   */
  async onInboundUpdate(
    oldRecord: Prisma.InboundRecordGetPayload<{}>,
    newRecord: Prisma.InboundRecordGetPayload<{}>,
  ) {
    // Revert Old, Apply New
    await this.onInboundDelete(oldRecord.id);
    await this.onInboundCreate(newRecord);
  },

  /**
   * Handle Outbound Update
   */
  async onOutboundUpdate(
    oldRecord: Prisma.OutboundRecordGetPayload<{}>,
    newRecord: Prisma.OutboundRecordGetPayload<{}>,
  ) {
    // Revert Old, Apply New
    await this.onOutboundDelete(oldRecord.id);
    await this.onOutboundCreate(newRecord);
  },
};
