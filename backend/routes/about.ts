import express, { type Router, type Request, type Response } from 'express';
import fs from 'fs/promises';
import { logger } from '@/utils/logger';
import { resolveFilesInDataPath } from '@/utils/paths';

const router: Router = express.Router();

/**
 * GET /api/about
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const aboutPath = resolveFilesInDataPath('about.json');
    await fs.access(aboutPath);
    const data = await fs.readFile(aboutPath, 'utf8');
    const aboutData = JSON.parse(data);
    res.json(aboutData);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to load about.json:', err);
    res.status(500).json({
      error: 'Failed to load about.json',
      details: err.message,
    });
  }
});

export default router;
