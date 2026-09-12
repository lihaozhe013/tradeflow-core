import { describe, it, expect } from 'vitest';
import { authAgent, publicAgent } from '@/test/helpers/request';

describe('GET /api/about', () => {
  it('returns application about information', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/about');

    expect(res.status).toBe(200);
    expect(res.body.title).toBeDefined();
    expect(res.body.company).toBeDefined();
    expect(res.body.system).toBeDefined();
    expect(res.body.company.name).toBeDefined();
    expect(res.body.system.version).toBeDefined();
  });

  it('requires authentication', async () => {
    const res = await publicAgent().get('/api/about');
    expect(res.status).toBe(401);
  });
});
