import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { z } from 'zod';
const issued = new Set<string>();
let issueCount = 0;
let revoked = 0;
const failedQuery = process.argv.includes('--fail-query');
const failedRevoke = process.argv.includes('--fail-revoke');
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  const send = (data: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
  };
  if (req.url?.startsWith('/api/')) {
    if (req.headers.authorization !== 'Bearer fixture-jwt') {
      send({}, 401);
      return;
    }
    if (req.url === '/api/mcp/capabilities') {
      send({
        data: { version: 1, endpointPath: '/mcp', enabled: true, allowedTools: ['get_inventory'] }
      });
      return;
    }
    if (req.url === '/api/stats') {
      send({ issueCount, revoked });
      return;
    }
    if (req.method === 'DELETE') {
      if (failedRevoke) {
        send({}, 503);
        return;
      }
      const id = req.url.split('/').at(-1)!;
      issued.delete(id);
      revoked++;
      res.writeHead(204).end();
      return;
    }
    const id = randomUUID();
    issued.add(id);
    issueCount++;
    send(
      {
        data: {
          id,
          token: `tfmcp_${id}`,
          tools: ['get_inventory'],
          expiresAt: '2030-01-01T00:00:00Z'
        }
      },
      201
    );
    return;
  }
  const token = req.headers.authorization?.replace('Bearer tfmcp_', '') ?? '';
  if (!issued.has(token)) {
    send({}, 401);
    return;
  }
  const mcp = new McpServer({ name: 'connect-fixture', version: '1' });
  mcp.registerTool(
    'get_inventory',
    {
      description: 'Fixture',
      inputSchema: z.object({ page: z.number().optional(), limit: z.number().optional() })
    },
    async () => ({
      isError: failedQuery,
      content: [{ type: 'text', text: '{}' }],
      structuredContent: {}
    })
  );
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch {
    if (!res.headersSent) res.writeHead(500).end();
  }
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(address.port);
});
