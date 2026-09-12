import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '@/app';
import { findUser, signToken } from '@/utils/auth';

export type TestRole = 'reader' | 'editor' | 'superuser';

let app: Express | null = null;

export function getApp(): Express {
  if (!app) {
    app = createApp();
  }
  return app;
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

export function publicAgent(): ReturnType<typeof request.agent> {
  return request.agent(getApp());
}

export async function authAgent(role: TestRole): Promise<ReturnType<typeof request.agent>> {
  const token = await getAuthToken(role);
  const agent = request.agent(getApp());
  agent.set('Authorization', `Bearer ${token}`);
  return agent;
}

/** Log in through the real login endpoint and return an authenticated agent for that user. */
export async function loginAgent(
  username: string,
  password: string
): Promise<ReturnType<typeof request.agent>> {
  const base = publicAgent();
  const login = await base.post('/api/auth/login').send({ username, password });
  if (login.status !== 200 || !login.body.token) {
    throw new Error(`Login failed for ${username}: ${login.status} ${JSON.stringify(login.body)}`);
  }
  const agent = request.agent(getApp());
  agent.set('Authorization', `Bearer ${login.body.token as string}`);
  return agent;
}
