import { serve } from '@hono/node-server';
import type { Server } from 'node:http';

export interface TestServer {
  server: Server;
  port: number;
  stop: () => Promise<void>;
}

export function createTestServer(app: { fetch: any }): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve({
        server: server as unknown as Server,
        port: info.port,
        stop: () =>
          new Promise<void>((res) => {
            (server as unknown as Server).close(() => res());
          })
      });
    });
  });
}
