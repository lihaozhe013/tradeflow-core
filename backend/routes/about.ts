import express, { type Router, type Request, type Response } from 'express';
import fs from 'fs/promises';
import { resolveFilesInDataPath } from '@/utils/paths';

const router: Router = express.Router();

/**
 * GET /api/about
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const aboutPath = resolveFilesInDataPath('about.json');
  await fs.access(aboutPath);
  const data = await fs.readFile(aboutPath, 'utf8');
  const aboutData = JSON.parse(data);
  res.json(aboutData);
});

export default router;
