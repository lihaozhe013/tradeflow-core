import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { hashMcpToken } from '@/mcp/credentials';
import { withMcpReadOnlyTransaction } from '@/mcp/server';
import { MCP_STAGING_TOOL_NAMES, READ_MCP_TOOL_NAMES } from '@/mcp/tools';
import { prisma } from '@/prismaClient';
import type { McpConfig, McpToolName } from '@/types/config';
import { authAgent } from '@/test/helpers/request';

const token = 'tfmcp_test-token-0123456789abcdef';
const settings: McpConfig = {
  enabled: true,
  allowedHosts: ['127.0.0.1'],
  allowedOrigins: ['127.0.0.1'],
  credentials: [
    {
      id: 'vitest-agent',
      tokenSha256: hashMcpToken(token),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      enabled: true,
      tools: [...READ_MCP_TOOL_NAMES]
    },
    {
      id: 'restricted-agent',
      tokenSha256: hashMcpToken('tfmcp_restricted-token-0123456789'),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      enabled: true,
      tools: ['get_inventory']
    }
  ]
};

const app = createApp(settings);
let server: Server;
let endpoint = '';
let client: Client;

function makeClient(accessToken: string): {
  client: Client;
  transport: StreamableHTTPClientTransport;
} {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    authProvider: { token: async () => accessToken }
  });
  return {
    client: new Client({ name: 'tradeflow-mcp-test', version: '1.0.0' }),
    transport
  };
}

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('MCP test server did not start.');
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const connected = makeClient(token);
  client = connected.client;
  await client.connect(connected.transport);
});

afterAll(async () => {
  await client.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('TradeFlow MCP', () => {
  it('only advertises the tools allowed by the credential', async () => {
    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([...READ_MCP_TOOL_NAMES].sort());

    const restricted = makeClient('tfmcp_restricted-token-0123456789');
    await restricted.client.connect(restricted.transport);
    try {
      const restrictedTools = await restricted.client.listTools();
      expect(restrictedTools.tools.map((tool) => tool.name)).toEqual(['get_inventory']);
      await expect(
        restricted.client.callTool({ name: 'get_analysis', arguments: {} })
      ).rejects.toThrow(/Tool get_analysis not found/);
    } finally {
      await restricted.client.close();
    }
  });

  it('registers explicitly scoped staging tools without creating formal transactions', async () => {
    const firstToken = `tfmcp_stage_${randomUUID()}`;
    const otherToken = `tfmcp_stage_${randomUUID()}`;
    const stagingSettings: McpConfig = {
      enabled: true,
      stagingWrites: { enabled: true },
      allowedHosts: ['127.0.0.1'],
      allowedOrigins: ['127.0.0.1'],
      credentials: [
        {
          id: `stage_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
          tokenSha256: hashMcpToken(firstToken),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          enabled: true,
          tools: [...MCP_STAGING_TOOL_NAMES]
        },
        {
          id: `stage_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
          tokenSha256: hashMcpToken(otherToken),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          enabled: true,
          tools: [...MCP_STAGING_TOOL_NAMES]
        }
      ]
    };
    const stagingApp = createApp(stagingSettings);
    const stagingServer = createServer(stagingApp);
    await new Promise<void>((resolve) => stagingServer.listen(0, '127.0.0.1', resolve));
    const address = stagingServer.address();
    if (!address || typeof address === 'string') throw new Error('MCP staging server did not start');
    const endpointUrl = `http://127.0.0.1:${address.port}/mcp`;
    const stagedClient = {
      client: new Client({ name: 'staging-write-test', version: '1' }),
      transport: new StreamableHTTPClientTransport(new URL(endpointUrl), {
        authProvider: { token: async () => firstToken }
      })
    };
    const isolatedClient = {
      client: new Client({ name: 'staging-isolation-test', version: '1' }),
      transport: new StreamableHTTPClientTransport(new URL(endpointUrl), {
        authProvider: { token: async () => otherToken }
      })
    };
    let draftId = '';
    const formalCountBefore = await prisma.inboundRecord.count();
    try {
      await stagedClient.client.connect(stagedClient.transport);
      await isolatedClient.client.connect(isolatedClient.transport);
      const tools = await stagedClient.client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
        [...MCP_STAGING_TOOL_NAMES].sort()
      );
      expect(
        tools.tools.find((tool) => tool.name === 'submit_transaction_drafts')?.annotations
          ?.readOnlyHint
      ).toBe(false);
      const submitted = await stagedClient.client.callTool({
        name: 'submit_transaction_drafts',
        arguments: {
          direction: 'inbound',
          requestId: `stage-test-${randomUUID()}`,
          records: [{ product_text: 'Unmatched MCP product', quantity: 2 }]
        }
      });
      expect(submitted.isError).not.toBe(true);
      const payload = submitted.structuredContent as {
        records: Array<{ id: string; status: string; issues: Array<{ code: string }> }>;
      };
      expect(payload.records).toHaveLength(1);
      draftId = payload.records[0]!.id;
      expect(payload.records[0]!.status).toBe('pending');
      expect(payload.records[0]!.issues.map((issue) => issue.code)).toContain('partner_required');

      const ownDrafts = await isolatedClient.client.callTool({
        name: 'list_transaction_drafts',
        arguments: { page: 1, limit: 20 }
      });
      expect((ownDrafts.structuredContent as { total: number }).total).toBe(0);
      const hiddenDraft = await isolatedClient.client.callTool({
        name: 'get_transaction_draft',
        arguments: { id: draftId }
      });
      expect(hiddenDraft.isError).toBe(true);
      expect(await prisma.inboundRecord.count()).toBe(formalCountBefore);
    } finally {
      if (draftId) {
        await prisma.transactionDraft.deleteMany({ where: { id: draftId } });
        await prisma.systemLog.deleteMany({ where: { resource: `/transaction-drafts/${draftId}` } });
      }
      await stagedClient.client.close();
      await isolatedClient.client.close();
      await new Promise<void>((resolve, reject) =>
        stagingServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it('returns structured data that matches the existing inventory API', async () => {
    const mcpResult = await client.callTool({ name: 'get_inventory', arguments: {} });
    const api = await (await authAgent('reader')).get('/api/inventory?page=1&limit=20');

    expect(mcpResult.isError).not.toBe(true);
    const mcpContent = mcpResult.structuredContent as {
      data: { data: Array<{ product_model: string; current_inventory: number }> };
      query_meta: { parameters: { page: number; limit: number } };
    };
    expect(mcpContent.data.data).toEqual(api.body.data);
    expect(mcpContent.query_meta.parameters).toEqual({ page: 1, limit: 20 });
    const textContent = mcpResult.content[0];
    expect(textContent?.type === 'text' ? JSON.parse(textContent.text) : undefined).toEqual(
      mcpResult.structuredContent
    );
  });

  it('returns structured, paginated results from the remaining read tools', async () => {
    const calls = [
      ['search_partners', { page: 1, limit: 2 }],
      ['search_products', { page: 1, limit: 2 }],
      ['list_transactions', { direction: 'inbound', page: 1, limit: 2 }],
      ['list_transactions', { direction: 'outbound', page: 1, limit: 2 }],
      ['get_payables', { page: 1, limit: 2 }]
    ] as const;

    for (const [name, args] of calls) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      const payload = result.structuredContent as {
        data: { data: unknown[]; page: number; limit: number };
        query_meta: { parameters: Record<string, unknown> };
      };
      expect(payload.data.data).toHaveLength(2);
      expect(payload.data).toMatchObject({ page: 1, limit: 2 });
      expect(payload.query_meta.parameters).toMatchObject(args);
    }

    const purchases = await client.callTool({
      name: 'get_analysis',
      arguments: { startDate: '2024-01-01', endDate: '2030-12-31', type: 'inbound' }
    });
    expect(purchases.isError).not.toBe(true);
    expect(
      (purchases.structuredContent as { data: { purchase_amount: number } }).data.purchase_amount
    ).toEqual(expect.any(Number));
  });

  it('matches REST receivable balances while omitting contact and free-text fields', async () => {
    const editor = await authAgent('editor');
    const api = await editor.get('/api/receivable?page=1&limit=20');
    const mcpResult = await client.callTool({
      name: 'get_receivables',
      arguments: { page: 1, limit: 20 }
    });

    expect(mcpResult.isError).not.toBe(true);
    const result = mcpResult.structuredContent as {
      data: { data: Array<Record<string, unknown>> };
    };
    expect(
      result.data.data.map((row) => ({
        customer_code: row['partner_code'],
        customer_short_name: row['short_name'],
        customer_full_name: row['full_name'],
        total_receivable: row['total_receivable'],
        total_paid: row['total_paid'],
        balance: row['balance'],
        last_payment_date: row['last_payment_date'],
        last_payment_method: row['last_payment_method'],
        payment_count: row['payment_count']
      }))
    ).toEqual(api.body.data);
    expect(result.data.data[0]).not.toHaveProperty('phone');
    expect(result.data.data[0]).not.toHaveProperty('remark');

    const customerCode = api.body.data[0].customer_code as string;
    const [restDetail, mcpDetail] = await Promise.all([
      editor.get(
        `/api/receivable/details/${customerCode}?outbound_page=1&outbound_limit=20&payment_page=1&payment_limit=20`
      ),
      client.callTool({
        name: 'get_receivables',
        arguments: { partnerCode: customerCode, page: 1, limit: 20 }
      })
    ]);
    const detail = mcpDetail.structuredContent as {
      data: {
        found: boolean;
        summary: { total_receivable: number; total_paid: number; balance: number };
        transactions: { total: number };
        payments: { total: number };
      };
    };
    expect(detail.data.found).toBe(true);
    expect(detail.data.summary).toEqual(restDetail.body.summary);
    expect(detail.data.transactions.total).toBe(restDetail.body.outbound_records.total);
    expect(detail.data.payments.total).toBe(restDetail.body.payment_records.total);
  });

  it('matches REST FIFO sales analysis and identifies its cost method', async () => {
    const query = 'start_date=2024-01-01&end_date=2030-12-31';
    const api = await (await authAgent('editor')).get(`/api/analysis/data?${query}`);
    const mcpResult = await client.callTool({
      name: 'get_analysis',
      arguments: { startDate: '2024-01-01', endDate: '2030-12-31', type: 'outbound' }
    });

    expect(mcpResult.isError).not.toBe(true);
    const result = mcpResult.structuredContent as {
      data: {
        sales_amount: number;
        cost_amount: number;
        profit_amount: number;
        profit_rate: number;
        cost_method: string;
      };
    };
    expect(result.data).toMatchObject({
      sales_amount: api.body.data.sales_amount,
      cost_amount: api.body.data.cost_amount,
      profit_amount: api.body.data.profit_amount,
      profit_rate: api.body.data.profit_rate,
      cost_method: 'FIFO'
    });
  });

  it('rejects invalid calendar dates and pagination limits', async () => {
    const invalidDate = await client.callTool({
      name: 'get_analysis',
      arguments: { startDate: '2025-02-30', endDate: '2025-03-01' }
    });
    expect(invalidDate.isError).toBe(true);

    const invalidPageSize = await client.callTool({
      name: 'get_inventory',
      arguments: { page: 1, limit: 101 }
    });
    expect(invalidPageSize.isError).toBe(true);
  });

  it('rejects missing or invalid credentials and mismatched hosts', async () => {
    const missing = await request(app).post('/mcp').send({});
    expect(missing.status).toBe(401);

    const invalid = await request(app).post('/mcp').set('Authorization', 'Bearer invalid').send({});
    expect(invalid.status).toBe(401);

    const badHost = await request(app)
      .post('/mcp')
      .set('Host', 'attacker.example')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(badHost.status).toBe(403);
  });

  it('rejects a browser origin outside the allowlist', async () => {
    const result = await request(app)
      .post('/mcp')
      .set('Origin', 'https://attacker.example')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(result.status).toBe(403);
  });

  it('does not expose MCP routes when disabled', async () => {
    const disabled = await request(createApp({ ...settings, enabled: false }))
      .post('/mcp')
      .send({});
    expect(disabled.status).toBe(404);
  });

  it('runs queries inside a database-enforced read-only transaction', async () => {
    await expect(
      withMcpReadOnlyTransaction(
        (db) => db.$executeRaw`UPDATE users SET enabled = enabled WHERE username = 'test_reader'`
      )
    ).rejects.toThrow(/read-only transaction/i);
  });

  it('supports an independent expired credential check', async () => {
    const expiredConfig: McpConfig = {
      ...settings,
      credentials: [
        {
          id: 'expired-agent',
          tokenSha256: hashMcpToken(token),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          tools: ['get_inventory'] as McpToolName[]
        }
      ]
    };
    const expiredApp = createApp(expiredConfig);
    const result = await request(expiredApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(result.status).toBe(401);
  });

  it('rejects disabled credentials', async () => {
    const disabledConfig: McpConfig = {
      ...settings,
      credentials: [
        {
          id: 'disabled-agent',
          tokenSha256: hashMcpToken(token),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          enabled: false,
          tools: ['get_inventory']
        }
      ]
    };
    const disabledApp = createApp(disabledConfig);
    const result = await request(disabledApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(result.status).toBe(401);
  });

  it('applies a per-credential request rate limit', async () => {
    const rateToken = 'tfmcp_rate-limit-token-0123456789';
    const rateLimitedApp = createApp({
      ...settings,
      requestsPerMinute: 1,
      credentials: [
        {
          id: 'rate-limited-agent',
          tokenSha256: hashMcpToken(rateToken),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          tools: ['get_inventory']
        }
      ]
    });
    const first = await request(rateLimitedApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${rateToken}`)
      .send({});
    const second = await request(rateLimitedApp)
      .post('/mcp')
      .set('Authorization', `Bearer ${rateToken}`)
      .send({});

    expect(first.status).not.toBe(429);
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBe('60');
  });
});
