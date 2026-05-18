import { Router } from 'express';
import * as db from '@saas/db';
import { createLogger, JobStatus, JOB_UPDATES_CHANNEL, JOB_CANCELLATIONS_CHANNEL, sendTelegramMessage } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import { connection, videoQueue, subscriber } from '../config.js';

const logger = createLogger('api');

export const router = Router();

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const jobs = await db.listJobs({ id: userId });
    res.json(jobs);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list jobs');
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { parameters } = req.body as { parameters: any };

  try {
    const tenantId = userId;

    const balance = await db.getCreditBalance(tenantId);
    if (balance < 3) {
      logger.warn({ userId, tenantId, balance }, 'Job creation blocked: insufficient credits');
      return res.status(402).json({ error: 'Insufficient credits', balance });
    }

    const job = await db.createJob({ userId, parameters }, { id: userId });

    await db.deductCredit(tenantId, 3, 'Video generation', { jobId: job.id });

    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id });

    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));

    logger.info({ jobId: job.id, userId, tenantId }, 'Job created and queued');

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

router.get('/stream', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

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

router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

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

router.post('/:id/feedback', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  const { rating, feedback } = req.body;

  try {
    const job = await db.getJob(id, { id: userId });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updatedJob = await db.updateJob(id, { rating, feedback });
    logger.info({ jobId: id, userId, rating }, 'Job feedback submitted');
    res.json(updatedJob);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to submit feedback');
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/retrigger', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;

  try {
    const job = await db.getJob(id, { id: userId });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const balance = await db.getCreditBalance(userId);
    if (balance < 3) {
      return res.status(402).json({ error: 'Insufficient credits', balance });
    }

    const updatedJob = await db.updateJob(id, { status: JobStatus.PENDING, videoUrl: undefined });
    await db.deductCredit(userId, 3, 'Video generation (retry)', { jobId: updatedJob.id });

    const existingJob = await videoQueue.getJob(id);
    if (existingJob) {
      await existingJob.remove();
      logger.info({ jobId: id, userId }, 'Removed stale BullMQ job before retrigger');
    }

    await videoQueue.add('generate-video', { jobId: updatedJob.id, userId: updatedJob.userId, parameters: updatedJob.parameters }, { jobId: updatedJob.id });

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

router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  try {
    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }));
    logger.info({ jobId: id, userId }, 'Published job cancellation signal');

    const bullJob = await videoQueue.getJob(id);
    if (bullJob) {
      try {
        await bullJob.remove();
        logger.info({ jobId: id, userId }, 'Removed job from BullMQ queue');
      } catch (err: any) {
        logger.warn({ jobId: id, userId, err: err.message }, 'Failed to remove job from BullMQ (possibly locked/active)');
      }
    }

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
