import express from 'express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, JOB_UPDATES_CHANNEL, CreateJobRequest, JobStatus, createLogger, sendTelegramMessage } from '@saas/shared';
import * as db from '@saas/db';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { clerkMiddleware, getAuth } from '@clerk/express';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { pinoHttp, type Options as PinoHttpOptions } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const logger = createLogger('api');

const app = express();

// ⚠️ Stripe webhook MUST be registered before express.json() —
// it needs the raw request body to verify the HMAC signature.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !sig) {
    return res.status(400).send('Missing webhook secret or signature');
  }

  let event: any;
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-04-10' as any });
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId    = session.metadata?.clerk_user_id;
    const credits   = parseInt(session.metadata?.credits || '0', 10);
    const affCookie = session.metadata?.affiliate_cookie;

    // 1. Top up the user's credit balance
    if (userId && credits > 0) {
      await db.addCredits(userId, credits, `stripe_checkout:${session.id}`);
      console.log(`[Stripe] Added ${credits} credits to user ${userId}`);
    }

    // 2. Affiliate attribution (only on first purchase by this user)
    if (userId && affCookie) {
      const [affiliateId, clickId] = affCookie.split(':');
      if (affiliateId) {
        const affiliate = await db.prisma.affiliate.findUnique({ where: { id: affiliateId } });
        if (affiliate && affiliate.status === 'active' && affiliate.userId !== userId) {
          const alreadyConverted = await db.hasExistingConversion(affiliateId, userId);
          if (!alreadyConverted) {
            const saleAmountUsd = (session.amount_total || 0) / 100;
            const commissionAmt = saleAmountUsd * (affiliate.commissionPct / 100);
            await db.createAffiliateConversion({
              affiliateId,
              clickId: clickId || undefined,
              referredUserId: userId,
              saleAmountUsd,
              commissionAmt,
              stripeSessionId: session.id,
            });
            console.log(`[Affiliate] $${commissionAmt.toFixed(2)} commission queued for affiliate ${affiliateId}`);
          }
        }
      }
    }
  }

  res.json({ received: true });
});

// Global middleware (after webhook — needs parsed JSON for all other routes)
app.use(express.json());
app.use(cors());
app.use(cookieParser());

// Extract token from query for SSE streams before clerkMiddleware
app.use((req, res, next) => {
  if (req.path === '/jobs/stream' && req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

app.use(clerkMiddleware({ clockSkewInMs: 60_000 }));

// Structured HTTP request logging — every request logged with method, url, status, responseTime
app.use(pinoHttp({
  logger,
  // Don't log SSE stream endpoint on every keepalive tick
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/jobs/stream',
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req: IncomingMessage) {
      return { method: (req as any).method, url: (req as any).url };
    },
    res(res: ServerResponse) {
      return { statusCode: res.statusCode };
    },
  },
} as PinoHttpOptions));

// Serve the demo directory as static
app.use('/demo', express.static(path.join(rootDir, 'demo')));

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

const subscriber = new Redis(redisUrl);

const videoQueue = new Queue(QUEUE_NAME, { connection });

app.get('/jobs', async (req, res) => {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const jobs = await db.listJobs({ id: userId });
    res.json(jobs);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list jobs');
    res.status(500).json({ error: error.message });
  }
});

app.post('/jobs', async (req, res) => {
  const { userId } = getAuth(req);
  const { parameters } = req.body as { parameters: any };
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tenantId = userId;

    // Check credit balance — hard block if 0
    const balance = await db.getCreditBalance(tenantId);
    if (balance < 3) {
      logger.warn({ userId, tenantId, balance }, 'Job creation blocked: insufficient credits');
      return res.status(402).json({ error: 'Insufficient credits', balance });
    }

    const job = await db.createJob({ userId, parameters }, { id: userId });

    // Deduct 3 credits atomically
    await db.deductCredit(tenantId, 3, 'job_created', job.id);
    
    // IMPORTANT: we explicitly set the bullmq jobId to match our db job.id
    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));

    logger.info({ jobId: job.id, userId, tenantId }, 'Job created and queued');

    // Telegram hook (fire and forget)
    db.prisma.userProfile.findUnique({ where: { id: userId } }).then(user => {
      const email = user?.email || userId;
      const url = parameters?.url || 'N/A';
      const instructions = parameters?.instructions ? `\nPrompt: <i>${parameters.instructions}</i>` : '';
      sendTelegramMessage(`🎬 <b>New Video Creation Started</b>\nJob ID: <code>${job.id}</code>\nUser: ${email}\nURL: ${url}${instructions}`);
    }).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for job creation'));
    res.status(201).json(job);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to create job');
    res.status(500).json({ error: error.message });
  }
});

app.get('/jobs/stream', (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const currentTenantId = userId;
  logger.info({ userId, tenantId: userId }, 'SSE stream connected');

  const handler = (channel: string, message: string) => {
    if (channel === JOB_UPDATES_CHANNEL) {
      try {
        const data = JSON.parse(message);
        // Only broadcast if the job belongs to the current tenant (org or user)
        if (data.userId === userId || data.job?.userId === userId) {
          res.write(`data: ${message}\n\n`);
        }
      } catch (e) {
        logger.error({ err: e, userId }, 'Failed to parse SSE message');
      }
    }
  };

  subscriber.subscribe(JOB_UPDATES_CHANNEL);
  subscriber.on('message', handler);

  req.on('close', () => {
    subscriber.off('message', handler);
    logger.info({ userId, tenantId: userId }, 'SSE stream disconnected');
  });
});

app.get('/jobs/:id', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const job = await db.getJob(req.params.id, { id: userId });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get job');
    res.status(500).json({ error: error.message });
  }
});

app.post('/jobs/:id/retrigger', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  
  try {
    // getJob will use ZenStack to verify the user has access
    const job = await db.getJob(id, { id: userId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const balance = await db.getCreditBalance(userId);
    if (balance < 3) {
      return res.status(402).json({ error: 'Insufficient credits', balance });
    }

    const updatedJob = await db.updateJob(id, { status: JobStatus.PENDING, videoUrl: undefined });
    await db.deductCredit(userId, 3, 'job_retriggered', updatedJob.id);
    
    // Ensure we remove the old job from queue if it's there (e.g. failed state)
    const existingJob = await videoQueue.getJob(id);
    if (existingJob) {
      await existingJob.remove();
      logger.info({ jobId: id, userId }, 'Removed stale BullMQ job before retrigger');
    }

    await videoQueue.add('generate-video', { jobId: updatedJob.id, userId: updatedJob.userId, parameters: updatedJob.parameters }, { jobId: updatedJob.id });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

    logger.info({ jobId: id, userId }, 'Job retriggered');
    res.json(updatedJob);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to retrigger job');
    res.status(500).json({ error: error.message });
  }
});

app.delete('/jobs/:id', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  try {
    // Attempt to remove from BullMQ first
    const bullJob = await videoQueue.getJob(id);
    if (bullJob) {
      try {
        await bullJob.remove();
        logger.info({ jobId: id, userId }, 'Removed job from BullMQ queue');
      } catch (err: any) {
        logger.warn({ jobId: id, userId, err: err.message }, 'Failed to remove job from BullMQ (possibly locked/active)');
      }
    }

    // ZenStack will automatically throw a P2004 error if unauthorized to delete
    await db.deleteJob(id, { id: userId });
    logger.info({ jobId: id, userId }, 'Job deleted');
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete job');
    res.status(500).json({ error: error.message });
  }
});

app.get('/credits', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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

// Upsert the authenticated user's profile — called from the frontend on sign-in
app.post('/users/sync', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { email, firstName, lastName, imageUrl } = req.body as {
    email: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  };

  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const existingUser = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    const profile = await db.upsertUser({ id: userId, email, firstName, lastName, imageUrl });
    logger.info({ userId }, 'User profile synced');
    
    if (!existingUser) {
      sendTelegramMessage(`👋 <b>New User Sign Up</b>\nEmail: ${email}\nName: ${firstName || ''} ${lastName || ''}`).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for user sign up'));
    } else {
      sendTelegramMessage(`🔑 <b>User Sign In</b>\nEmail: ${email}`).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for user sign in'));
    }
    res.json(profile);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to sync user profile');
    res.status(500).json({ error: error.message });
  }
});

// ── Stripe Checkout ────────────────────────────────────────────────────────────

// Credit pack definitions — matches the pricing UI
const CREDIT_PACKS = {
  starter:    { credits: 10,  priceUsd: 10,  label: '10 Credits' },
  pro:        { credits: 50,  priceUsd: 40,  label: '50 Credits' },
  enterprise: { credits: 200, priceUsd: 130, label: '200 Credits' },
} as const;
type PackKey = keyof typeof CREDIT_PACKS;

// POST /checkout — creates a Stripe Checkout session and returns the URL
app.post('/checkout', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { pack } = req.body as { pack?: PackKey };
  const chosen = CREDIT_PACKS[pack ?? 'starter'];
  if (!chosen) return res.status(400).json({ error: 'Invalid pack' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' as any });

    // Read the affiliate attribution cookie if present
    const affCookie = (req as any).cookies?.aff || '';

    const appUrl = process.env.APP_URL || 'https://trypitch.co';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: chosen.priceUsd * 100, // Stripe uses cents
            product_data: {
              name: `TryPitch — ${chosen.label}`,
              description: `${chosen.credits} video generation credits for TryPitch`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        clerk_user_id: userId,
        credits: chosen.credits.toString(),
        pack: pack ?? 'starter',
        affiliate_cookie: affCookie, // e.g. "affiliateId:clickId" — used by webhook for attribution
      },
      success_url: `${appUrl}/dashboard?checkout=success&credits=${chosen.credits}`,
      cancel_url:  `${appUrl}/pricing?checkout=cancelled`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('[Stripe Checkout] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Affiliate Program Routes ──────────────────────────────────────────────────

// Public redirect — the actual referral link (e.g. trypitch.co/r/MUKUND-X7K2)
app.get('/r/:code', async (req, res) => {
  const affiliate = await db.getAffiliateByCode(req.params.code);
  if (!affiliate || affiliate.status !== 'active') {
    return res.redirect(302, 'https://trypitch.co');
  }

  // Hash the IP for privacy compliance (GDPR / PDPB)
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

  // 30-day attribution cookie (httpOnly, secure, sameSite=lax)
  res.cookie('aff', `${affiliate.id}:${click.id}`, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  const appUrl = process.env.APP_URL || 'https://trypitch.co';
  res.redirect(302, `${appUrl}?ref=${req.params.code}`);
});

// Register as an affiliate (requires Clerk auth)
app.post('/affiliate/register', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    const firstName = profile?.firstName || 'User';
    const affiliate = await db.registerAffiliate(userId, firstName);
    res.json(affiliate);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get the current user's affiliate profile + stats
app.get('/affiliate/me', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const affiliate = await db.getAffiliateByUserId(userId);
    if (!affiliate) return res.status(404).json({ error: 'Not an affiliate yet' });

    const stats = await db.getAffiliateStats(affiliate.id);
    res.json({ ...affiliate, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Request a payout (minimum $10 threshold)
app.post('/affiliate/me/payout', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const affiliate = await db.getAffiliateByUserId(userId);
    if (!affiliate) return res.status(404).json({ error: 'Not an affiliate' });

    const stats = await db.getAffiliateStats(affiliate.id);
    if (stats.pendingPayout < 10) {
      return res.status(400).json({ error: 'Minimum payout is $10', pending: stats.pendingPayout });
    }

    const payout = await db.requestAffiliatePayout(affiliate.id, stats.pendingPayout);
    res.json(payout);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started');
});
