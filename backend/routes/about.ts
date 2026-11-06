import { Hono } from 'hono';
import { readSetting } from '@/settings/service';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await readSetting('about'));
});

export default app;
