import * as db from '@saas/db'
import {
  createLogger,
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
  sendTelegramMessage,
} from '@saas/shared'
import { Router } from 'express'
import { connection, videoQueue } from '../config.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:pdf')

export const router = Router()

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const jobs = await db.listJobs({ id: userId })
    const pdfJobs = jobs.filter(j => j.parameters?.jobType === 'pdf')
    res.json(pdfJobs)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list PDF jobs')
    res.status(500).json({ error: error.message })
  }
})

router.post('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  const { parameters } = req.body as { parameters: any }

  try {
    const tenantId = userId

    const balance = await db.getCreditBalance(tenantId)
    if (balance < 1) {
      logger.warn({ userId, tenantId, balance }, 'PDF job creation blocked: insufficient credits')
      return res.status(402).json({ error: 'Insufficient credits', balance })
    }

    // Ensure parameters has jobType: 'pdf'
    const pdfParams = {
      ...parameters,
      jobType: 'pdf',
    }

    const job = await db.createJob({ userId, parameters: pdfParams }, { id: userId })

    // Deduct 1 credit for PDF generation
    await db.deductCredit(tenantId, 1, 'PDF generation', { jobId: job.id })

    // Queue to the same queue. The worker will detect jobType: 'pdf'
    await videoQueue.add(
      'generate-video',
      { jobId: job.id, userId: job.userId, parameters: pdfParams },
      { jobId: job.id },
    )

    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job))

    logger.info({ jobId: job.id, userId, tenantId }, 'PDF job created and queued')

    db.prisma.userProfile
      .findUnique({ where: { id: userId } })
      .then(user => {
        const email = user?.email || userId
        const topic = parameters?.topic || 'N/A'
        sendTelegramMessage(
          `📄 <b>New PDF Creation Started</b>\nJob ID: <code>${job.id}</code>\nUser: ${email}\nTopic: <i>${topic}</i>`,
        )
      })
      .catch(err =>
        logger.error({ err }, 'Failed to send Telegram notification for PDF job creation'),
      )

    res.status(201).json(job)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to create PDF job')
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (job?.parameters?.jobType !== 'pdf') {
      return res.status(404).json({ error: 'PDF Job not found' })
    }
    res.json(job)
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get PDF job')
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params
  try {
    const job = await db.getJob(id, { id: userId })
    if (job?.parameters?.jobType !== 'pdf') {
      return res.status(404).json({ error: 'PDF Job not found' })
    }

    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }))
    logger.info({ jobId: id, userId }, 'Published PDF job cancellation signal')

    const bullJob = await videoQueue.getJob(id)
    if (bullJob) {
      try {
        await bullJob.remove()
        logger.info({ jobId: id, userId }, 'Removed PDF job from BullMQ queue')
      } catch (err: any) {
        logger.warn({ jobId: id, userId, err: err.message }, 'Failed to remove PDF job from BullMQ')
      }
    }

    if (job.status === JobStatus.PROCESSING) {
      let newPhases: PhaseUpdate[] = []
      if (job.phases) {
        newPhases = job.phases.map(p => {
          if (p.status === 'running') {
            return { ...p, status: 'failed', completedAt: new Date().toISOString() }
          }
          return p
        })
      }

      const failedJob = await db.updateJob(id, {
        status: JobStatus.FAILED,
        error: 'PDF generation was cancelled/aborted by the user.',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      // Refund 1 credit for PDF
      await db.addCredits(userId, 1, 'refund', 'Refund: PDF generation cancelled', { jobId: id })
      logger.info({ jobId: id, userId }, 'PDF job marked as failed and credits refunded')
    } else {
      await db.deleteJob(id, { id: userId })
      logger.info({ jobId: id, userId }, 'PDF job deleted')
    }
    res.status(204).send()
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete PDF job')
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/save', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { html } = req.body as { html: string }
  if (!html) {
    return res.status(400).json({ error: 'HTML content is required' })
  }

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (job?.parameters?.jobType !== 'pdf') {
      return res.status(404).json({ error: 'PDF Job not found' })
    }

    const parameters = job.parameters
    const jobName = parameters.jobName || job.id
    const prefix = `pitch/${job.userId}/pdfs/${jobName}`

    const fs = await import('fs')
    const path = await import('path')
    const storage = await import('@saas/storage')

    const tempDir = path.join(process.cwd(), 'pptx', `temp_${job.id}`)
    const tempFilePath = path.join(tempDir, 'output.html')
    const pdfPath = path.join(tempDir, 'output.pdf')

    const cleanupTemp = () => {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir)
      } catch (e) {
        logger.warn({ err: e }, 'Failed to clean up temp HTML/PDF edit files')
      }
    }

    try {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      fs.writeFileSync(tempFilePath, html, 'utf-8')

      // ── Fast path: upload HTML and respond immediately ────────────────────────
      const htmlUrl = await storage.uploadFile(tempFilePath, undefined, prefix)

      // Keep the local workspace copy in sync (best-effort)
      const workspacePptxDir = path.join(process.cwd(), 'pptx', `ppt-${job.id}`)
      if (fs.existsSync(workspacePptxDir)) {
        try {
          fs.copyFileSync(tempFilePath, path.join(workspacePptxDir, 'output.html'))
        } catch (err) {
          logger.warn({ err }, 'Failed to copy updated HTML to workspace directory')
        }
      }

      // pdfGenerating: true signals the client that a fresh PDF is being produced
      // in the background, so a "Download PDF" click can show a "Preparing…" state.
      await db.prisma.job.update({
        where: { id: job.id },
        data: { parameters: JSON.stringify({ ...parameters, htmlUrl, pdfGenerating: true }) },
      })

      const updatedJob = await db.getJob(job.id, { id: userId })
      if (updatedJob) {
        await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
      }

      res.json({ success: true, htmlUrl: `${htmlUrl}?t=${Date.now()}`, pdfGenerating: true })
      // ── Background: regenerate PDF without blocking the response ─────────────
      // Runs after the HTTP response is already sent; errors are logged only.
      ;(async () => {
        let browser: import('playwright').Browser | undefined
        let pdfUrl: string | undefined
        try {
          const { chromium } = await import('playwright')
          browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          })
          const page = await browser.newPage()
          await page.setViewportSize({ width: 1280, height: 720 })
          await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 })
          await new Promise(resolve => setTimeout(resolve, 6000))
          await page.pdf({ path: pdfPath, width: '1280px', height: '720px', printBackground: true })
          await browser.close()
          browser = undefined

          pdfUrl = await storage.uploadFile(pdfPath, undefined, prefix)

          if (fs.existsSync(workspacePptxDir)) {
            try {
              fs.copyFileSync(pdfPath, path.join(workspacePptxDir, 'output.pdf'))
            } catch (_) {
              /* best-effort */
            }
          }

          logger.info({ jobId: job.id }, 'Background PDF regeneration complete')
        } catch (pdfErr) {
          logger.warn({ err: pdfErr, jobId: job.id }, 'Background PDF regeneration failed')
        } finally {
          await browser?.close().catch(() => {})
          // Always clear pdfGenerating so the client never waits forever;
          // update pdfUrl only when regeneration actually succeeded.
          try {
            await db.prisma.job.update({
              where: { id: job.id },
              data: {
                parameters: JSON.stringify({ ...parameters, htmlUrl, pdfGenerating: false }),
                ...(pdfUrl ? { pdfUrl } : {}),
              },
            })
            const jobWithPdf = await db.getJob(job.id, { id: userId })
            if (jobWithPdf)
              await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(jobWithPdf))
          } catch (updErr) {
            logger.warn({ err: updErr, jobId: job.id }, 'Failed to clear pdfGenerating flag')
          }
          cleanupTemp()
        }
      })()
    } catch (err) {
      cleanupTemp()
      throw err
    }
  } catch (error: any) {
    logger.error({ err: error, jobId: req.params.id }, 'Failed to save PDF HTML changes')
    res.status(500).json({ error: error.message })
  }
})
