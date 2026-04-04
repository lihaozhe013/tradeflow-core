import express, { type Router, type Request, type Response } from 'express';
import aboutData from '@/../build-config/about.json';

const router: Router = express.Router();

/**
 * GET /api/about
 */
router.get('/', (_req: Request, res: Response): void => {
  res.json(aboutData);
});

export default router;
