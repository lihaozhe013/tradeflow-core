import { EventEmitter } from 'node:events';
import type { Hono } from 'hono';
import { createApp } from '@/app';
import { findUser, signToken } from '@/utils/auth';
import type { AppEnv } from '@/types/hono';

export type TestRole = 'reader' | 'editor' | 'superuser';

let appInstance: Hono<AppEnv> | null = null;

export function getApp(): Hono<AppEnv> {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
}

export interface TestResponse {
  status: number;
  statusCode: number;
  body: any;
  text: string;
  headers: Record<string, string>;
  header: Record<string, string>;
}

// oxlint-disable-next-line unicorn/no-thenable
export class TestRequest implements PromiseLike<TestResponse> {
  private method: string;
  private path: string;
  private headers: Record<string, string> = {};
  private bodyData?: unknown;
  private customParser?: (res: any, cb: (err: any, data: any) => void) => void;

  constructor(
    private app: Hono<AppEnv>,
    method: string,
    path: string,
    defaultHeaders: Record<string, string> = {}
  ) {
    this.method = method;
    this.path = path;
    this.headers = { ...defaultHeaders };
  }

  query(params: Record<string, any>): this {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) searchParams.set(k, String(v));
    }
    const qs = searchParams.toString();
    if (qs) {
      this.path = this.path.includes('?') ? `${this.path}&${qs}` : `${this.path}?${qs}`;
    }
    return this;
  }

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(data: unknown): this {
    this.bodyData = data;
    return this;
  }

  buffer(_enabled = true): this {
    return this;
  }

  parse(parser: (res: any, cb: (err: any, data: any) => void) => void): this {
    this.customParser = parser;
    return this;
  }

  async then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?: ((value: TestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const res = await this.execute();
      return onfulfilled ? onfulfilled(res) : (res as unknown as TResult1);
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  private async execute(): Promise<TestResponse> {
    let body: string | undefined;
    const reqHeaders = new Headers();
    for (const [k, v] of Object.entries(this.headers)) {
      reqHeaders.set(k, v);
    }

    if (this.bodyData !== undefined) {
      if (typeof this.bodyData === 'object' && this.bodyData !== null) {
        if (!reqHeaders.has('content-type')) {
          reqHeaders.set('content-type', 'application/json');
        }
        body = JSON.stringify(this.bodyData);
      } else {
        body = String(this.bodyData);
      }
    }

    const host = reqHeaders.get('host') || '127.0.0.1';
    if (!reqHeaders.has('host')) {
      reqHeaders.set('host', host);
    }
    const url = this.path.startsWith('http') ? this.path : `http://${host}${this.path}`;
    const req = new Request(url, {
      method: this.method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(this.method) ? undefined : body
    });

    const response = await this.app.request(req);
    const status = response.status;
    const resHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      resHeaders[k.toLowerCase()] = v;
    });

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const text = buffer.toString('utf-8');

    let parsedBody: any;
    if (this.customParser) {
      const mockStream = new EventEmitter();
      let parseResult: any;
      this.customParser(mockStream, (_err: any, data: any) => {
        parseResult = data;
      });
      mockStream.emit('data', buffer);
      mockStream.emit('end');
      parsedBody = parseResult ?? buffer;
    } else {
      const ct = resHeaders['content-type'] || '';
      if (ct.includes('application/json')) {
        try {
          parsedBody = JSON.parse(text);
        } catch {
          parsedBody = {};
        }
      } else {
        parsedBody = buffer;
      }
    }

    return {
      status,
      statusCode: status,
      body: parsedBody,
      text,
      headers: resHeaders,
      header: resHeaders
    };
  }
}

export class TestAgent {
  private defaultHeaders: Record<string, string> = {};

  constructor(private app: Hono<AppEnv>) {}

  set(name: string, value: string): this {
    this.defaultHeaders[name.toLowerCase()] = value;
    return this;
  }

  get(path: string): TestRequest {
    return new TestRequest(this.app, 'GET', path, this.defaultHeaders);
  }

  post(path: string): TestRequest {
    return new TestRequest(this.app, 'POST', path, this.defaultHeaders);
  }

  put(path: string): TestRequest {
    return new TestRequest(this.app, 'PUT', path, this.defaultHeaders);
  }

  delete(path: string): TestRequest {
    return new TestRequest(this.app, 'DELETE', path, this.defaultHeaders);
  }

  patch(path: string): TestRequest {
    return new TestRequest(this.app, 'PATCH', path, this.defaultHeaders);
  }
}

export function createTestRequest(app: Hono<AppEnv>): TestAgent {
  return new TestAgent(app);
}

const tokenCache = new Map<TestRole, string>();

export async function getAuthToken(role: TestRole): Promise<string> {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const username = `test_${role}`;
  const user = await findUser(username);
  if (!user) {
    throw new Error(`Seeded user "${username}" not found; did global setup run?`);
  }

  const { token } = signToken(user);
  tokenCache.set(role, token);
  return token;
}

export function publicAgent(): TestAgent {
  return new TestAgent(getApp());
}

export async function authAgent(role: TestRole): Promise<TestAgent> {
  const token = await getAuthToken(role);
  const agent = new TestAgent(getApp());
  agent.set('Authorization', `Bearer ${token}`);
  return agent;
}

/** Log in through the real login endpoint and return an authenticated agent for that user. */
export async function loginAgent(username: string, password: string): Promise<TestAgent> {
  const base = publicAgent();
  const login = await base.post('/api/auth/login').send({ username, password });
  if (login.status !== 200 || !login.body.token) {
    throw new Error(`Login failed for ${username}: ${login.status} ${JSON.stringify(login.body)}`);
  }
  const agent = new TestAgent(getApp());
  agent.set('Authorization', `Bearer ${login.body.token as string}`);
  return agent;
}

export default function request(app: Hono<AppEnv>): TestAgent {
  return new TestAgent(app);
}
