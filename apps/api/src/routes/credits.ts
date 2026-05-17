import { Router } from 'express';
import * as db from '@saas/db';
import { createLogger } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';

const logger = createLogger('api');

export const router = Router();

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const tenantId = userId;
    const balance = await db.getCreditBalance(tenantId);
    const transactions = await db.getCreditTransactions(tenantId);
    res.json({ balance, transactions });
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch credits');
    res.status(500).json({ error: error.message });
  }
});
