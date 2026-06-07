import { Router } from 'express';
import * as db from '@saas/db';
import { pruneStorageStateCookies } from '@saas/storage';
import { createLogger } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import {
  startSession,
  closeSession,
  HostError,
} from '../services/browser-host.js';

const logger = createLogger('api:browser');
export const router = Router();

// Credits charged once per stealth authentication session (kept in sync with the
// CreditChip amount shown on the Authenticate / Open-browser buttons).
const AUTH_SESSION_COST = 2;

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

// Forget a saved login (e.g. to re-authenticate fresh, or remove a stale one).
router.delete('/origins', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const origin = (req.query.origin as string | undefined)?.trim();
  if (!origin) return res.status(400).json({ error: 'origin is required' });
  try {
    const profile = await db.removeLoggedInOrigin(userId, origin);
    // Also purge the matching cookies from the stored session in S3 — a real
    // delete, not just hiding it from the list.
    try {
      let host = origin;
      try { host = new URL(origin).hostname; } catch { /* origin may be a bare host */ }
      await pruneStorageStateCookies(userId, host);
    } catch (pruneErr) {
      logger.warn({ err: pruneErr, userId, origin }, 'failed to prune storage_state cookies from S3');
    }
    res.json({ loggedInOrigins: profile.loggedInOrigins });
  } catch (err: any) {
    logger.error({ err, userId, origin }, 'failed to remove logged-in origin');
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

  // Gate on credits before spinning up the stealth browser (same pattern as jobs).
  const balance = await db.getCreditBalance(userId);
  if (balance < AUTH_SESSION_COST) {
    logger.warn({ userId, balance }, 'Auth session blocked: insufficient credits');
    return res.status(402).json({ error: 'Insufficient credits', balance, cost: AUTH_SESSION_COST });
  }

  try {
    const result = await startSession({
      userId,
      startUrl: startUrl ?? null,
      headless: !!headless,
    });

    // Charge once for the session. Balance was checked above; if the deduction
    // still races to a failure, keep the running session and just log it.
    try {
      await db.deductCredit(userId, AUTH_SESSION_COST, 'Browser authentication session', {
        idempotencyKey: result.sessionId,
      });
    } catch (creditErr: any) {
      logger.error({ err: creditErr, userId, sessionId: result.sessionId }, 'failed to charge for auth session');
    }

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
