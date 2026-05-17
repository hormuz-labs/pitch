import type express from 'express';
import { getAuth } from '@clerk/express';
import { createLogger } from '@saas/shared';

const logger = createLogger('api');

export const requireAuth = (req: express.Request, res: express.Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    let reason = 'Token missing, expired, or invalid';
    const debug = typeof (auth as any).debug === 'function' ? (auth as any).debug() : {};
    if (debug && debug.message) {
      reason = debug.message;
    } else if (auth.sessionStatus) {
      reason = `Session status: ${auth.sessionStatus}`;
    }

    logger.error({ auth: { ...auth, getToken: undefined }, debug, path: req.path }, `401 Unauthorized: ${reason}`);

    res.status(401).json({ error: 'Unauthorized', reason, debug });
    return null;
  }
  return auth.userId;
};
