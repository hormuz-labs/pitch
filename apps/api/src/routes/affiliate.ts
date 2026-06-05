import { Router } from 'express';
import * as db from '@saas/db';
import { createLogger } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import crypto from 'crypto';

const logger = createLogger('affiliate-routes');

export const redirectRouter = Router();

redirectRouter.get('/r/:code', async (req, res) => {
  const affiliate = await db.getAffiliateByCode(req.params.code);
  if (!affiliate || affiliate.status !== 'active') {
    return res.redirect(302, 'https://trypitch.co');
  }

  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const hashedIp = crypto.createHash('sha256').update(rawIp + (process.env.IP_SALT || 'salt')).digest('hex');

  const platform = (req.query.utm_source as string) || 'direct';
  const refPage  = (req.query.landing as string) || '/';

  const click = await db.createAffiliateClick({
    affiliateId: affiliate.id,
    ip: hashedIp,
    userAgent: req.headers['user-agent']?.slice(0, 250),
    platform,
    refPage,
  });

  res.cookie('aff', `${affiliate.id}:${click.id}`, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  const appUrl = process.env.APP_URL || 'https://trypitch.co';
  res.redirect(302, `${appUrl}?ref=${req.params.code}`);
});

export const router = Router();

router.post('/register', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    const firstName = profile?.firstName || 'User';
    const affiliate = await db.registerAffiliate(userId, firstName);
    res.json(affiliate);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const affiliate = await db.getAffiliateByUserId(userId);
    if (!affiliate) return res.status(404).json({ error: 'Not an affiliate yet' });

    const stats = await db.getAffiliateStats(affiliate.id);
    res.json({ ...affiliate, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

