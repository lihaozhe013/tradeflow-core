import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { z } from 'zod';
const server = createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer tfmcp_protocol_fixture') {
    res.writeHead(401).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    res.writeHead(400).end();
    return;
  }
  const mcp = new McpServer({ name: 'tradeflow-fixture', version: '1' });
  mcp.registerTool(
    'get_inventory',
    {
      description: 'Fixture inventory',
      inputSchema: z.object({ page: z.number().optional(), limit: z.number().optional() })
    },
    async () => ({
      content: [{ type: 'text', text: '{"data":[]}' }],
      structuredContent: { data: [] }
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
