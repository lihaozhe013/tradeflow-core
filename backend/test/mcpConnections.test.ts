import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { mcpPrisma } from '@/prismaClient';
import { signToken } from '@/utils/auth';
import { config } from '@/utils/paths';
import { createMcpTokenVerifier } from '@/mcp/credentials';
import type { McpConfig } from '@/types/config';

const settings: McpConfig = {
  enabled: true,
  allowedHosts: ['127.0.0.1'],
  allowedOrigins: [],
  credentials: []
};
const app = createApp(settings);
const prefix = `mcp_${randomUUID()}`;
const users = [`${prefix}_reader`, `${prefix}_editor`];
let readerJwt = '';
let editorJwt = '';
const deviceId = randomUUID();
const verifier = createMcpTokenVerifier(settings);
const issue = (jwt: string, client = 'opencode') =>
  request(app)
    .post('/api/mcp/connections')
    .set('Authorization', `Bearer ${jwt}`)
    .send({ client, deviceId });

beforeAll(async () => {
  const reader = await mcpPrisma.user.create({
    data: {
      username: users[0]!,
      password_hash: 'not-used',
      role: 'reader',
      last_password_change: '2026-01-01T00:00:00.000Z'
    }
  });
  const editor = await mcpPrisma.user.create({
    data: {
      username: users[1]!,
      password_hash: 'not-used',
      role: 'editor',
      last_password_change: '2026-01-01T00:00:00.000Z'
    }
  });
  readerJwt = signToken(reader).token;
  editorJwt = signToken(editor).token;
});
afterAll(async () => {
  await mcpPrisma.user.deleteMany({ where: { username: { in: users } } });
});

describe('User MCP connections', () => {
  it('requires a real login and validates external input', async () => {
    expect((await request(app).post('/api/mcp/connections').send({})).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/mcp/connections')
          .set('Authorization', `Bearer ${readerJwt}`)
          .send({ client: 'other', deviceId })
      ).status
    ).toBe(400);
    const auth = config.auth!;
    const enabled = auth.enabled;
    auth.enabled = false;
    try {
      expect((await issue(readerJwt)).status).toBe(409);
    } finally {
      auth.enabled = enabled;
    }
  });
  it('issues a 90-day credential and hides secrets from list responses', async () => {
    const result = await issue(readerJwt);
    expect(result.status).toBe(201);
    expect(result.body.data.tools).toHaveLength(4);
    expect(result.body.data.tools).not.toContain('get_analysis');
    expect(result.body.data).not.toHaveProperty('tokenSha256');
    const auth = await verifier.verifyAccessToken(result.body.data.token);
    expect(auth.scopes).toHaveLength(4);
    const listed = await request(app)
      .get('/api/mcp/connections')
      .set('Authorization', `Bearer ${readerJwt}`);
    expect(JSON.stringify(listed.body)).not.toContain(result.body.data.token);
    expect(JSON.stringify(listed.body)).not.toContain('tokenSha256');
    const created = Date.parse(result.body.data.createdAt);
    expect(Math.abs(Date.parse(result.body.data.expiresAt) - created - 90 * 86400000)).toBeLessThan(
      1000
    );
  });
  it('prevents cross-account revocation and revokes immediately and idempotently', async () => {
    const result = await issue(readerJwt);
    const path = `/api/mcp/connections/${result.body.data.id}`;
    expect(
      (await request(app).delete(path).set('Authorization', `Bearer ${editorJwt}`)).status
    ).toBe(404);
    expect(
      (await request(app).delete(path).set('Authorization', `Bearer ${readerJwt}`)).status
    ).toBe(204);
    expect(
      (await request(app).delete(path).set('Authorization', `Bearer ${readerJwt}`)).status
    ).toBe(204);
    await expect(verifier.verifyAccessToken(result.body.data.token)).rejects.toThrow(
      'Invalid MCP access token'
    );
  });
  it('uses current role, account status, expiry and password version', async () => {
    const result = await issue(editorJwt);
    const token = result.body.data.token as string;
    expect((await verifier.verifyAccessToken(token)).scopes).toHaveLength(7);
    await mcpPrisma.user.update({ where: { username: users[1]! }, data: { role: 'reader' } });
    expect((await verifier.verifyAccessToken(token)).scopes).toHaveLength(4);
    await mcpPrisma.user.update({ where: { username: users[1]! }, data: { enabled: false } });
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
    await mcpPrisma.user.update({
      where: { username: users[1]! },
      data: { enabled: true, role: 'editor' }
    });
    await mcpPrisma.mcpConnection.update({
      where: { id: result.body.data.id },
      data: { expiresAt: new Date(0) }
    });
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
    await mcpPrisma.mcpConnection.update({
      where: { id: result.body.data.id },
      data: { expiresAt: new Date(Date.now() + 60000) }
    });
    await mcpPrisma.user.update({
      where: { username: users[1]! },
      data: { last_password_change: new Date().toISOString() }
    });
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });
  it('shares request budget between credentials owned by one account', async () => {
    const first = await issue(readerJwt);
    const second = await issue(readerJwt, 'workbuddy');
    const limited = createApp({ ...settings, requestsPerMinute: 1 });
    const one = await request(limited)
      .post('/mcp')
      .set('Authorization', `Bearer ${first.body.data.token}`)
      .send({});
    const two = await request(limited)
      .post('/mcp')
      .set('Authorization', `Bearer ${second.body.data.token}`)
      .send({});
    expect(one.status).not.toBe(429);
    expect(two.status).toBe(429);
  });
  it('filters discovery and rejects financial calls after a live downgrade', async () => {
    const owner = await mcpPrisma.user.findUniqueOrThrow({ where: { username: users[1]! } });
    const created = await issue(signToken(owner).token);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not start');
    const client = new Client({ name: 'dynamic-permission-test', version: '1' });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
          authProvider: { token: async () => created.body.data.token as string }
        })
      );
      expect((await client.listTools()).tools).toHaveLength(7);
      await mcpPrisma.user.update({ where: { username: users[1]! }, data: { role: 'reader' } });
      expect((await client.listTools()).tools).toHaveLength(4);
      await expect(client.callTool({ name: 'get_analysis', arguments: {} })).rejects.toThrow(
        /not found/
      );
      await mcpPrisma.user.delete({ where: { username: users[1]! } });
      await expect(verifier.verifyAccessToken(created.body.data.token)).rejects.toThrow();
      expect(await mcpPrisma.mcpConnection.count({ where: { ownerUsername: users[1]! } })).toBe(0);
    } finally {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('reports disabled MCP and refuses issuance', async () => {
    const disabled = createApp({ ...settings, enabled: false });
    const capabilities = await request(disabled)
      .get('/api/mcp/capabilities')
      .set('Authorization', `Bearer ${readerJwt}`);
    expect(capabilities.body.data.enabled).toBe(false);
    expect(
      (
        await request(disabled)
          .post('/api/mcp/connections')
          .set('Authorization', `Bearer ${readerJwt}`)
          .send({ client: 'opencode', deviceId })
      ).status
    ).toBe(409);
  });
});
