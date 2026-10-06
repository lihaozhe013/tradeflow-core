import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import {
  createMcpExpressApp as createProtectedMcpApp,
  requireBearerAuth
} from '@modelcontextprotocol/express';
import type { AuthInfo } from '@modelcontextprotocol/server';
import type { Prisma } from '@/prisma/client';
import type { Express, Request, Response, NextFunction } from 'express';
import * as z from 'zod/v4';
import {
  calculateFilteredSoldGoodsCost,
  calculatePurchaseData,
  calculateSalesData
} from '@/routes/analysis/utils';
import decimalCalc from '@/utils/decimalCalculator';
import { config, currency_unit_symbol } from '@/utils/paths';
import { logger } from '@/utils/logger';
import {
  getAccountDetails,
  listAccountBalances,
  listInventory,
  listTransactions,
  searchPartners,
  searchProducts
} from '@/services/readService';
import type { McpConfig, McpToolName } from '@/types/config';
import { DEFAULT_MCP_PAGE_SIZE, MCP_TOOL_NAMES, MAX_MCP_PAGE_SIZE } from '@/mcp/tools';
import { createMcpTokenVerifier, validateMcpConfig } from '@/mcp/credentials';
import { createMcpDraftTools } from '@/mcp/transactionDraftTools';
import type { DraftSource } from '@/services/transactionDraftService';
import { withMcpReadOnlyTransaction } from '@/mcp/database';

const pageSchema = z.number().int().min(1).default(1);
const limitSchema = z.number().int().min(1).max(MAX_MCP_PAGE_SIZE).default(DEFAULT_MCP_PAGE_SIZE);
const optionalText = (max = 100) => z.string().trim().min(1).max(max).optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.')
  .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, {
    message: 'Use a valid calendar date.'
  });
const dateRangeSchema = z
  .object({ startDate: isoDate, endDate: isoDate })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: 'startDate must be on or before endDate.'
  });

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
let activeAnalysisCalls = 0;

type ToolHandler<TArgs extends Record<string, unknown>> = (
  args: TArgs,
  db: Prisma.TransactionClient
) => Promise<unknown>;

export { withMcpReadOnlyTransaction } from '@/mcp/database';

function registerReadTool<TArgs extends Record<string, unknown>>(
  server: McpServer,
  name: McpToolName,
  description: string,
  inputSchema: z.ZodType<TArgs>,
  handler: ToolHandler<TArgs>,
  maxConcurrentAnalysis = 0
): void {
  server.registerTool(name, { description, inputSchema, annotations }, async (rawArgs) => {
    if (maxConcurrentAnalysis > 0 && activeAnalysisCalls >= maxConcurrentAnalysis) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Analysis is busy. Try again shortly.' }]
      };
    }
    if (maxConcurrentAnalysis > 0) activeAnalysisCalls += 1;

    try {
      const parameters = rawArgs as TArgs;
      const data = await withMcpReadOnlyTransaction((db) => handler(parameters, db));
      const result = {
        data,
        query_meta: {
          queried_at: new Date().toISOString(),
          currency_unit_symbol,
          parameters
        }
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result
      };
    } catch (error) {
      logger.error('MCP read tool failed', {
        tool: name,
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
      return {
        isError: true,
        content: [{ type: 'text', text: 'The requested data could not be retrieved.' }]
      };
    } finally {
      if (maxConcurrentAnalysis > 0) activeAnalysisCalls -= 1;
    }
  });
}

function registerTools(
  server: McpServer,
  allowedTools: ReadonlySet<McpToolName>,
  configValue: McpConfig,
  draftSource: DraftSource
) {
  const register = <TArgs extends Record<string, unknown>>(
    name: McpToolName,
    description: string,
    schema: z.ZodType<TArgs>,
    handler: ToolHandler<TArgs>,
    analysis = false
  ) => {
    if (allowedTools.has(name)) {
      registerReadTool(
        server,
        name,
        description,
        schema,
        handler,
        analysis ? (configValue.maxConcurrentAnalysis ?? 1) : 0
      );
    }
  };

  register(
    'search_partners',
    'Search customers and suppliers by code or name. Contact details are not returned.',
    z.object({
      type: z.enum(['all', 'customer', 'supplier']).default('all'),
      shortName: optionalText(),
      fullName: optionalText(),
      code: optionalText(),
      page: pageSchema,
      limit: limitSchema
    }),
    async (args, db) => {
      const type = args.type === 'customer' ? 1 : args.type === 'supplier' ? 0 : undefined;
      const result = await searchPartners(db, { ...args, type });
      return {
        ...result,
        data: result.data.map((partner) => ({
          code: partner.code,
          short_name: partner.short_name,
          full_name: partner.full_name,
          type: partner.type
        }))
      };
    }
  );

  register(
    'search_products',
    'Search products by code, model or category. Free-text remarks are not returned.',
    z.object({
      category: optionalText(),
      productModel: optionalText(),
      code: optionalText(),
      page: pageSchema,
      limit: limitSchema
    }),
    async (args, db) => {
      const result = await searchProducts(db, args);
      return {
        ...result,
        data: result.data.map((product) => ({
          code: product.code,
          category: product.category,
          product_model: product.product_model
        }))
      };
    }
  );

  register(
    'get_inventory',
    'Read current on-hand inventory, optionally filtered by product model.',
    z.object({ productModel: optionalText(), page: pageSchema, limit: limitSchema }),
    (args, db) => listInventory(db, args)
  );

  register(
    'list_transactions',
    'List inbound or outbound transaction records with optional date, partner, product and document-number filters. Contact details and remarks are omitted.',
    z
      .object({
        direction: z.enum(['inbound', 'outbound']),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        partnerCode: optionalText(),
        productModel: optionalText(),
        invoiceNumber: optionalText(),
        receiptNumber: optionalText(),
        orderNumber: optionalText(),
        page: pageSchema,
        limit: limitSchema
      })
      .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
        message: 'startDate must be on or before endDate.'
      }),
    async (args, db) => {
      const result = await listTransactions(db, {
        ...args,
        sortField: args.direction === 'inbound' ? 'inbound_date' : 'outbound_date',
        sortOrder: 'desc'
      });
      const data = result.data.map((rawRow) => {
        const row = rawRow as Prisma.InboundRecordGetPayload<{
          include: { partner: true; product: true };
        }> &
          Prisma.OutboundRecordGetPayload<{ include: { partner: true; product: true } }>;
        return {
          id: row.id,
          date: args.direction === 'inbound' ? row.inbound_date : row.outbound_date,
          partner: {
            code: row.partner.code,
            short_name: row.partner.short_name,
            full_name: row.partner.full_name
          },
          product_model: row.product?.product_model ?? null,
          quantity: row.quantity,
          unit_price: row.unit_price,
          total_price: row.total_price,
          invoice_date: row.invoice_date,
          invoice_number: row.invoice_number,
          receipt_number: row.receipt_number,
          order_number: row.order_number
        };
      });
      return { ...result, data };
    }
  );

  const accountSchema = z.object({
    partnerCode: optionalText(),
    shortName: optionalText(),
    page: pageSchema,
    limit: limitSchema
  });

  for (const kind of ['receivable', 'payable'] as const) {
    const name = kind === 'receivable' ? 'get_receivables' : 'get_payables';
    const displayName = kind === 'receivable' ? 'receivable' : 'payable';
    register(
      name,
      `Read ${displayName} balances, or detailed transaction and payment records for one partner.`,
      accountSchema,
      async (args, db) => {
        if (!args.partnerCode) {
          const result = await listAccountBalances(db, {
            kind,
            shortName: args.shortName,
            page: args.page,
            limit: args.limit
          });
          const totalKey = kind === 'receivable' ? 'total_receivable' : 'total_payable';
          return {
            ...result,
            data: result.data.map((row) => ({
              partner_code: row.partner_code,
              short_name: row.short_name,
              full_name: row.full_name,
              [totalKey]: row.total_amount,
              total_paid: row.total_paid,
              balance: row.balance,
              last_payment_date: row.last_payment_date,
              last_payment_method: row.last_payment_method,
              payment_count: row.payment_count
            }))
          };
        }
        const detail = await getAccountDetails(db, {
          kind,
          partnerCode: args.partnerCode,
          page: args.page,
          limit: args.limit
        });
        if (!detail) return { found: false, partner_code: args.partnerCode };
        const totalKey = kind === 'receivable' ? 'total_receivable' : 'total_payable';
        return {
          ...detail,
          found: true,
          summary: {
            [totalKey]: detail.summary.total_amount,
            total_paid: detail.summary.total_paid,
            balance: detail.summary.balance
          }
        };
      }
    );
  }

  register(
    'get_analysis',
    'Read purchase or sales analysis for a date range. Sales includes FIFO cost, profit and profit rate.',
    dateRangeSchema.extend({
      type: z.enum(['inbound', 'outbound']).default('outbound'),
      partnerCode: optionalText(),
      productModel: optionalText()
    }),
    async (args, db) => {
      if (args.type === 'inbound') {
        const data = await calculatePurchaseData(
          args.startDate,
          args.endDate,
          args.partnerCode,
          args.productModel,
          db
        );
        return { ...data, cost_method: 'not_applicable' };
      }

      const [salesData, costAmount] = await Promise.all([
        calculateSalesData(args.startDate, args.endDate, args.partnerCode, args.productModel, db),
        calculateFilteredSoldGoodsCost(
          args.startDate,
          args.endDate,
          args.partnerCode,
          args.productModel,
          db
        )
      ]);
      const profitAmount = decimalCalc.toDbNumber(
        decimalCalc.subtract(salesData.sales_amount, costAmount),
        2
      );
      const profitRate =
        salesData.sales_amount > 0
          ? decimalCalc.toDbNumber(
              decimalCalc.multiply(decimalCalc.divide(profitAmount, salesData.sales_amount), 100),
              2
            )
          : 0;
      return {
        ...salesData,
        cost_amount: costAmount,
        profit_amount: profitAmount,
        profit_rate: profitRate,
        cost_method: 'FIFO'
      };
    },
    true
  );

  if (configValue.stagingWrites?.enabled) {
    createMcpDraftTools(server, allowedTools, configValue, draftSource);
  }
}

export function createMcpRouter(mcpConfig: McpConfig): Express {
  const settings = validateMcpConfig(mcpConfig);
  const app = createProtectedMcpApp({
    host: '0.0.0.0',
    allowedHosts: settings.allowedHosts,
    allowedOrigins:
      settings.allowedOrigins.length > 0 ? settings.allowedOrigins : settings.allowedHosts,
    jsonLimit: '100kb'
  });
  const verifier = createMcpTokenVerifier(settings);
  const authenticate = requireBearerAuth({ verifier });

  app.post('/', authenticate, (req: Request, res: Response, next) => {
    const auth = (req as Request & { auth?: AuthInfo }).auth;
    const agentId = auth?.clientId;
    if (!agentId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const startedAt = Date.now();
    res.once('finish', () => {
      const body = req.body as { method?: unknown; params?: { name?: unknown } } | undefined;
      const tool = typeof body?.params?.name === 'string' ? body.params.name : undefined;
      logger.info('MCP request completed', {
        integrationId: agentId,
        method:
          typeof body?.method === 'string' &&
          [
            'initialize',
            'notifications/initialized',
            'server/discover',
            'tools/list',
            'tools/call',
            'ping'
          ].includes(body.method)
            ? body.method
            : 'unknown',
        ...(MCP_TOOL_NAMES.includes(tool as McpToolName) ? { tool } : {}),
        durationMs: Date.now() - startedAt,
        status: res.statusCode
      });
    });

    const budgetKey =
      typeof auth?.extra?.['budgetKey'] === 'string' ? auth.extra['budgetKey'] : agentId;
    if (!allowRequest(settings, budgetKey, res)) return;

    const ownerUsername = budgetKey.startsWith('user:') ? budgetKey.slice('user:'.length) : null;
    const draftSource: DraftSource = {
      scopeKey: ownerUsername ? `account:${ownerUsername}` : `static:${agentId}`,
      sourceId: ownerUsername ?? agentId,
      ownerUsername,
      connectionId: ownerUsername ? agentId : null,
      actor: `mcp:${ownerUsername ?? agentId}`
    };

    const server = new McpServer({ name: 'tradeflow-core', version: '1.0.0' });
    const scopes = new Set(
      (auth?.scopes ?? []).filter((scope): scope is McpToolName =>
        MCP_TOOL_NAMES.includes(scope as McpToolName)
      )
    );
    registerTools(server, scopes, settings, draftSource);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    void server
      .connect(transport)
      .then(() => transport.handleRequest(req, res, req.body))
      .catch(next);
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('MCP protocol request failed', { status: 500 });
    res.status(500).json({ error: 'MCP request failed.' });
  });
  return app;
}

interface RequestWindow {
  startsAt: number;
  count: number;
}

const requestWindows = new Map<string, RequestWindow>();
const activeRequests = new Map<string, number>();

function allowRequest(settings: McpConfig, agentId: string, res: Response): boolean {
  const now = Date.now();
  const window = requestWindows.get(agentId);
  const state = !window || now - window.startsAt >= 60_000 ? { startsAt: now, count: 0 } : window;
  const requestLimit = settings.requestsPerMinute ?? 60;
  if (state.count >= requestLimit) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'MCP request rate limit exceeded.' });
    return false;
  }
  const active = activeRequests.get(agentId) ?? 0;
  if (active >= (settings.maxConcurrentRequests ?? 2)) {
    res.status(429).json({ error: 'Too many concurrent MCP requests.' });
    return false;
  }

  state.count += 1;
  requestWindows.set(agentId, state);
  activeRequests.set(agentId, active + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (activeRequests.get(agentId) ?? 1) - 1;
    if (remaining > 0) activeRequests.set(agentId, remaining);
    else activeRequests.delete(agentId);
  };
  res.once('finish', release);
  res.once('close', release);
  return true;
}

export function getMcpSettings(): McpConfig {
  const value = config.mcp ?? {
    enabled: false,
    allowedHosts: [],
    allowedOrigins: [],
    credentials: []
  };
  return validateMcpConfig(value);
}
