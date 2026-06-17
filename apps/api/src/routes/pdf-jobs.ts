import { Router } from 'express';
import * as db from '@saas/db';
import { createLogger, JobStatus, JOB_UPDATES_CHANNEL, JOB_CANCELLATIONS_CHANNEL, sendTelegramMessage, type PhaseUpdate } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import { connection, videoQueue } from '../config.js';

const logger = createLogger('api:pdf');

export const router = Router();

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const jobs = await db.listJobs({ id: userId });
    const pdfJobs = jobs.filter(j => j.parameters?.jobType === 'pdf');
    res.json(pdfJobs);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list PDF jobs');
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
    if (balance < 1) {
      logger.warn({ userId, tenantId, balance }, 'PDF job creation blocked: insufficient credits');
      return res.status(402).json({ error: 'Insufficient credits', balance });
    }

    // Ensure parameters has jobType: 'pdf'
    const pdfParams = {
      ...parameters,
      jobType: 'pdf',
    };

    const job = await db.createJob({ userId, parameters: pdfParams }, { id: userId });

    // Deduct 1 credit for PDF generation
    await db.deductCredit(tenantId, 1, 'PDF generation', { jobId: job.id });

    // Queue to the same queue. The worker will detect jobType: 'pdf'
    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters: pdfParams }, { jobId: job.id });

    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));

    logger.info({ jobId: job.id, userId, tenantId }, 'PDF job created and queued');

    db.prisma.userProfile.findUnique({ where: { id: userId } }).then(user => {
      const email = user?.email || userId;
      const topic = parameters?.topic || 'N/A';
      sendTelegramMessage(`📄 <b>New PDF Creation Started</b>\nJob ID: <code>${job.id}</code>\nUser: ${email}\nTopic: <i>${topic}</i>`);
    }).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for PDF job creation'));

    res.status(201).json(job);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to create PDF job');
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const job = await db.getJob(req.params.id, { id: userId });
    if (!job || job.parameters?.jobType !== 'pdf') {
      return res.status(404).json({ error: 'PDF Job not found' });
    }
    res.json(job);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get PDF job');
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  try {
    const job = await db.getJob(id, { id: userId });
    if (!job || job.parameters?.jobType !== 'pdf') {
      return res.status(404).json({ error: 'PDF Job not found' });
    }

    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }));
    logger.info({ jobId: id, userId }, 'Published PDF job cancellation signal');

    const bullJob = await videoQueue.getJob(id);
    if (bullJob) {
      try {
        await bullJob.remove();
        logger.info({ jobId: id, userId }, 'Removed PDF job from BullMQ queue');
      } catch (err: any) {
        logger.warn({ jobId: id, userId, err: err.message }, 'Failed to remove PDF job from BullMQ');
      }
    }

    if (job.status === JobStatus.PROCESSING) {
      let newPhases: PhaseUpdate[] = [];
      if (job.phases) {
        newPhases = job.phases.map(p => {
          if (p.status === 'running') {
            return { ...p, status: 'failed', completedAt: new Date().toISOString() };
          }
          return p;
        });
      }

      const failedJob = await db.updateJob(id, {
        status: JobStatus.FAILED,
        error: 'PDF generation was cancelled/aborted by the user.',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {})
      });
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));

      // Refund 1 credit for PDF
      await db.addCredits(userId, 1, 'refund', 'Refund: PDF generation cancelled', { jobId: id });
      logger.info({ jobId: id, userId }, 'PDF job marked as failed and credits refunded');
    } else {
      await db.deleteJob(id, { id: userId });
      logger.info({ jobId: id, userId }, 'PDF job deleted');
    }
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete PDF job');
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/save', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { html } = req.body as { html: string };
  if (!html) {
    return res.status(400).json({ error: 'HTML content is required' });
  }

  try {
    const job = await db.getJob(req.params.id, { id: userId });
    if (!job || job.parameters?.jobType !== 'pdf') {
      return res.status(404).json({ error: 'PDF Job not found' });
    }

    const parameters = job.parameters;
    const jobName = parameters.jobName || job.id;
    const prefix = `pitch/${job.userId}/pdfs/${jobName}`;

    // Create a temporary file locally inside workspace
    const fs = await import('fs');
    const path = await import('path');
    const storage = await import('@saas/storage');

    const tempDir = path.join(process.cwd(), 'pptx', `temp_${job.id}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, 'output.html');
    fs.writeFileSync(tempFilePath, html, 'utf-8');

    // Generate PDF via Playwright
    const pdfPath = path.join(tempDir, 'output.pdf');
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setContent(html);
      // Wait for fonts/images/charts to load (mimicking pdf-builder-template wait time)
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await page.pdf({
        path: pdfPath,
        width: '1280px',
        height: '720px',
        printBackground: true
      });
    } finally {
      await browser.close();
    }

    // Also copy to the workspace local path if it exists to keep local storage in sync
    const workspacePptxDir = path.join(process.cwd(), 'pptx', `ppt-${job.id}`);
    if (fs.existsSync(workspacePptxDir)) {
      try {
        fs.copyFileSync(tempFilePath, path.join(workspacePptxDir, 'output.html'));
        if (fs.existsSync(pdfPath)) {
          fs.copyFileSync(pdfPath, path.join(workspacePptxDir, 'output.pdf'));
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to copy updated files to workspace directory');
      }
    }

    // Upload to storage (this overwrites the existing output.html and output.pdf in MinIO)
    const htmlUrl = await storage.uploadFile(tempFilePath, undefined, prefix);
    const pdfUrl = await storage.uploadFile(pdfPath, undefined, prefix);

    // Clean up temporary local files
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      fs.rmdirSync(tempDir);
    } catch (e) {
      logger.warn({ err: e }, 'Failed to clean up temp HTML/PDF edit files');
    }

    // Update the job parameters to include the updated htmlUrl, and update pdfUrl with the new pdfUrl
    const updatedParams = {
      ...parameters,
      htmlUrl,
    };

    await db.prisma.job.update({
      where: { id: job.id },
      data: { 
        parameters: JSON.stringify(updatedParams),
        pdfUrl: pdfUrl,
      },
    });

    // Broadcast the updated job over SSE so editor is in sync
    const updatedJob = await db.getJob(job.id, { id: userId });
    if (updatedJob) {
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));
    }

    res.json({ success: true, htmlUrl, pdfUrl });
  } catch (error: any) {
    logger.error({ err: error, jobId: req.params.id }, 'Failed to save PDF HTML changes');
    res.status(500).json({ error: error.message });
  }
});
