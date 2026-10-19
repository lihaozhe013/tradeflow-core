import { Router } from 'express';
import { readSetting } from '@/settings/service';
const router = Router();
router.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readSetting('about'));
});
export default router;
