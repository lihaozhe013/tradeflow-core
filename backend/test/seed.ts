import { prisma } from '@/prismaClient';
import { hashPassword } from '@/utils/auth';
import { inventoryService } from '@/utils/inventoryService';
import type { Prisma } from '@/prisma/client';
import {
  alphaNum,
  amount2,
  dateIso,
  datetimeIso,
  pick,
  quantity,
  round2,
  twoYearsAgo,
  unitPrice
} from './factories/random';

const SCALE = Math.max(1, Number(process.env['TEST_DATA_SCALE'] ?? 1));

const COUNTS = {
  suppliers: 500 * SCALE,
  customers: 500 * SCALE,
  products: 1500 * SCALE,
  prices: 1000 * SCALE,
  inbound: 2000 * SCALE,
  outbound: 2000 * SCALE,
  receivablePayments: 500 * SCALE,
  payablePayments: 500 * SCALE,
  randomUsers: 12 * SCALE,
  logs: 1500 * SCALE
};

const CHUNK_SIZE = 500;

const SEEDED_PASSWORD = 'testpass123';

export const SPECIAL_USERS = ['test_editor', 'test_reader', 'test_superuser'] as const;

export type SpecialRole = 'reader' | 'editor' | 'superuser';

/** Fixed superuser credentials for manual testing after seeding. */
export const MANUAL_USERNAME = 'admin';
export const MANUAL_PASSWORD = 'admin123';

const CATEGORIES = [
  'Electronic Components',
  'Fasteners',
  'Industrial Machinery',
  'Packaging',
  'Raw Materials',
  'Consumables',
  'Instrumentation',
  'Cables & Connectors'
];

const PAY_METHODS = ['bank', 'cash', 'wechat', 'alipay', 'cheque'];

const LOG_ACTIONS = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'export',
  'refresh',
  'import'
];

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0');
}

export function truncateAll(): Promise<number> {
  return prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "users", "partners", "products", "inbound_records", "outbound_records",
      "inventory", "inventory_ledger", "product_prices", "receivable_payments",
      "payable_payments", "system_logs" RESTART IDENTITY CASCADE
  `);
}

async function seedUsers(passwordHash: string, manualPasswordHash: string): Promise<string[]> {
  const users: Prisma.UserCreateManyInput[] = [];

  for (const username of SPECIAL_USERS) {
    users.push({
      username,
      password_hash: passwordHash,
      role: username.replace('test_', ''),
      display_name: `Test ${username.replace('test_', '')}`,
      enabled: true,
      last_password_change: new Date().toISOString()
    });
  }

  users.push({
    username: MANUAL_USERNAME,
    password_hash: manualPasswordHash,
    role: 'superuser',
    display_name: 'Administrator',
    enabled: true,
    last_password_change: new Date().toISOString()
  });

  for (let i = 0; i < COUNTS.randomUsers; i += 1) {
    users.push({
      username: `user_${pad(i, 3)}`,
      password_hash: passwordHash,
      role: pick(['reader', 'editor', 'superuser'] as const),
      display_name: `Seeded User ${i}`,
      enabled: randBool(),
      last_password_change: new Date().toISOString()
    });
  }

  for (let i = 0; i < users.length; i += CHUNK_SIZE) {
    await prisma.user.createMany({ data: users.slice(i, i + CHUNK_SIZE) });
  }
  return users.map((u) => u.username);
}

function randBool(): boolean {
  return Math.random() < 0.9;
}

async function seedPartners() {
  const suppliers: Prisma.PartnerCreateManyInput[] = [];
  const customers: Prisma.PartnerCreateManyInput[] = [];
  const digits = String(Math.max(COUNTS.suppliers, COUNTS.customers)).length;

  for (let i = 0; i < COUNTS.suppliers; i += 1) {
    suppliers.push({
      code: `SUP${pad(i, digits)}`,
      short_name: `Supplier ${i}`,
      full_name: `Supplier ${i} Ltd.`,
      address: `Address ${i}, Main Street`,
      contact_person: `Contact Person ${i}`,
      contact_phone: `+86 1300000${pad(i, 4)}`,
      type: 0
    });
  }

  for (let i = 0; i < COUNTS.customers; i += 1) {
    customers.push({
      code: `CUS${pad(i, digits)}`,
      short_name: `Customer ${i}`,
      full_name: `Customer ${i} Co., Ltd.`,
      address: `Address ${i}, Market Road`,
      contact_person: `Buyer ${i}`,
      contact_phone: `+86 1310000${pad(i, 4)}`,
      type: 1
    });
  }

  for (let i = 0; i < suppliers.length; i += CHUNK_SIZE) {
    await prisma.partner.createMany({ data: suppliers.slice(i, i + CHUNK_SIZE) });
  }
  for (let i = 0; i < customers.length; i += CHUNK_SIZE) {
    await prisma.partner.createMany({ data: customers.slice(i, i + CHUNK_SIZE) });
  }

  return {
    supplierCodes: suppliers.map((s) => s.code),
    customerCodes: customers.map((c) => c.code)
  };
}

async function seedProducts() {
  const products: Prisma.ProductCreateManyInput[] = [];
  const digits = String(COUNTS.products).length;

  for (let i = 0; i < COUNTS.products; i += 1) {
    products.push({
      code: `PRD${pad(i, digits)}`,
      product_model: `MOD-${alphaNum(6)}-${pad(i, 4)}`,
      category: pick(CATEGORIES),
      remark: i % 5 === 0 ? 'Sample remark' : null
    });
  }

  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    await prisma.product.createMany({ data: products.slice(i, i + CHUNK_SIZE) });
  }

  return products;
}

async function seedProductPrices(supplierShortNames: string[], models: string[]) {
  const from = twoYearsAgo();
  const rows: Prisma.ProductPriceCreateManyInput[] = [];

  for (let i = 0; i < COUNTS.prices; i += 1) {
    rows.push({
      partner_short_name: pick(supplierShortNames),
      product_model: pick(models),
      effective_date: dateIso(from, new Date()),
      unit_price: amount2(1, 500)
    });
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await prisma.productPrice.createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
  }
}

async function seedInbound(supplierCodes: string[], productCodes: string[]) {
  const from = twoYearsAgo();
  const rows: Prisma.InboundRecordCreateManyInput[] = [];

  for (let i = 0; i < COUNTS.inbound; i += 1) {
    const qty = quantity();
    const price = unitPrice(true);
    const inboundDate = dateIso(from, new Date());
    const noInvoice = Math.random() < 0.3;
    rows.push({
      supplier_code: pick(supplierCodes),
      product_code: pick(productCodes),
      quantity: qty,
      unit_price: price,
      total_price: round2(qty * price),
      inbound_date: inboundDate,
      invoice_date: noInvoice ? null : inboundDate,
      invoice_number: noInvoice ? null : `INV-${alphaNum(6)}`,
      receipt_number: `RCV-${alphaNum(6)}`,
      order_number: `PO-${alphaNum(6)}`,
      remark: i % 4 === 0 ? 'Bulk order' : null
    });
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await prisma.inboundRecord.createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
  }
}

async function seedOutbound(customerCodes: string[], productCodes: string[]) {
  const from = twoYearsAgo();
  const rows: Prisma.OutboundRecordCreateManyInput[] = [];

  for (let i = 0; i < COUNTS.outbound; i += 1) {
    const qty = quantity();
    const price = unitPrice(true);
    const outboundDate = dateIso(from, new Date());
    const noInvoice = Math.random() < 0.3;
    rows.push({
      customer_code: pick(customerCodes),
      product_code: pick(productCodes),
      quantity: qty,
      unit_price: price,
      total_price: round2(qty * price),
      outbound_date: outboundDate,
      invoice_date: noInvoice ? null : outboundDate,
      invoice_number: noInvoice ? null : `INV-${alphaNum(6)}`,
      receipt_number: `DEL-${alphaNum(6)}`,
      order_number: `SO-${alphaNum(6)}`,
      remark: i % 5 === 0 ? 'Express delivery' : null
    });
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await prisma.outboundRecord.createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
  }
}

async function seedPayments(customerCodes: string[], supplierCodes: string[]) {
  const from = twoYearsAgo();
  const receivables: Prisma.ReceivablePaymentCreateManyInput[] = [];
  const payables: Prisma.PayablePaymentCreateManyInput[] = [];

  for (let i = 0; i < COUNTS.receivablePayments; i += 1) {
    receivables.push({
      customer_code: pick(customerCodes),
      amount: amount2(10, 50000),
      pay_date: dateIso(from, new Date()),
      pay_method: pick(PAY_METHODS),
      remark: i % 3 === 0 ? 'Installment payment' : null
    });
  }

  for (let i = 0; i < COUNTS.payablePayments; i += 1) {
    payables.push({
      supplier_code: pick(supplierCodes),
      amount: amount2(10, 50000),
      pay_date: dateIso(from, new Date()),
      pay_method: pick(PAY_METHODS),
      remark: i % 3 === 0 ? 'Wire transfer' : null
    });
  }

  for (let i = 0; i < receivables.length; i += CHUNK_SIZE) {
    await prisma.receivablePayment.createMany({ data: receivables.slice(i, i + CHUNK_SIZE) });
  }
  for (let i = 0; i < payables.length; i += CHUNK_SIZE) {
    await prisma.payablePayment.createMany({ data: payables.slice(i, i + CHUNK_SIZE) });
  }
}

async function seedLogs(usernames: string[]) {
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const rows: Prisma.SystemLogCreateManyInput[] = [];

  for (let i = 0; i < COUNTS.logs; i += 1) {
    rows.push({
      username: pick(usernames),
      action: pick(LOG_ACTIONS),
      resource: pick([
        'partners',
        'products',
        'inbound',
        'outbound',
        'users',
        'export',
        'analysis'
      ]),
      params: JSON.stringify({ id: i }),
      user_agent: 'vitest-seed',
      created_at: datetimeIso(from, new Date())
    });
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await prisma.systemLog.createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
  }
}

export interface SeedResult {
  supplierCodes: string[];
  customerCodes: string[];
  productCodes: string[];
  productModels: string[];
  supplierShortNames: string[];
  usernames: string[];
}

export async function seedDatabase(): Promise<SeedResult> {
  await truncateAll();

  const passwordHash = await hashPassword(SEEDED_PASSWORD);
  const manualPasswordHash = await hashPassword(MANUAL_PASSWORD);

  const usernames = await seedUsers(passwordHash, manualPasswordHash);

  const { supplierCodes, customerCodes } = await seedPartners();

  const products = await seedProducts();
  const productCodes = products.map((p) => p.code);
  const productModels = products.map((p) => p.product_model as string);
  const supplierShortNames = supplierCodes.map((_, i) => `Supplier ${i}`);

  await seedProductPrices(supplierShortNames, productModels);
  await seedInbound(supplierCodes, productCodes);
  await seedOutbound(customerCodes, productCodes);
  await seedPayments(customerCodes, supplierCodes);
  await seedLogs(usernames);

  const recalc = await inventoryService.recalculateAll();
  console.info(
    `[seed] Inventory recalculated: ${recalc.processed_events} events, ${recalc.products_count} products.`
  );

  return {
    supplierCodes,
    customerCodes,
    productCodes,
    productModels,
    supplierShortNames,
    usernames
  };
}
