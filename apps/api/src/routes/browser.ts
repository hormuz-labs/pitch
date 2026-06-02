import { Router } from 'express';
import * as db from '@saas/db';
import { createLogger } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import {
  startSession,
  closeSession,
  HostError,
} from '../services/browser-host.js';

const logger = createLogger('api:browser');
export const router = Router();

router.get('/profile', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const profile = await db.getOrCreateBrowserProfile(userId);
    const active = await db.listActiveBrowserSessions(userId);
    res.json({ profile, activeSessions: active });
  } catch (err: any) {
    logger.error({ err, userId }, 'failed to load browser profile');
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { startUrl, headless } = (req.body ?? {}) as { startUrl?: string; headless?: boolean };

  if (startUrl) {
    try {
      const u = new URL(startUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return res.status(400).json({ error: 'startUrl must be http(s)' });
      }
    } catch {
      return res.status(400).json({ error: 'startUrl is not a valid URL' });
    }
  }

  try {
    const result = await startSession({
      userId,
      startUrl: startUrl ?? null,
      headless: !!headless,
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof HostError) {
      if (err.code === 'ACTIVE_SESSION_EXISTS') {
        return res.status(409).json({ error: err.message, code: err.code });
      }
      return res.status(400).json({ error: err.message, code: err.code });
    }
    logger.error({ err, userId }, 'failed to start browser session');
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const session = await db.getBrowserSession(req.params.id, { id: userId });
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (session.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    res.json(session);
  } catch (err: any) {
    logger.error({ err, userId, id: req.params.id }, 'failed to get session');
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions/:id/close', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const result = await closeSession(req.params.id, userId);
    res.json(result);
  } catch (err: any) {
    if (err instanceof HostError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    logger.error({ err, userId, id: req.params.id }, 'failed to close session');
    res.status(500).json({ error: err.message });
  }
});
