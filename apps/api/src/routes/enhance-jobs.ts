import * as db from '@saas/db'
import {
  createLogger,
  ENHANCE_QUEUE_NAME,
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
  sendDiscordMessage,
} from '@saas/shared'
import * as storage from '@saas/storage'
import { Queue } from 'bullmq'
import { Router } from 'express'
import multer from 'multer'
import * as os from 'os'
import * as path from 'path'
import { connection } from '../config.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:enhance')
export const router = Router()

// ── Multer: accept PDF and PPTX uploads up to 50 MB ─────────────────────────
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(_req, file, cb) {
    const allowed = ['.pdf', '.pptx']
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowed.includes(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}. Only .pdf and .pptx are allowed.`))
    }
    cb(null, true)
  },
})

// ── Dedicated BullMQ queue for enhance jobs ───────────────────────────────────
const enhanceQueue = new Queue(ENHANCE_QUEUE_NAME, { connection: connection as any })

// ── GET / — list all enhance jobs for the authenticated user ─────────────────
router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const jobs = await db.listJobs({ id: userId })
    const enhanceJobs = jobs.filter(j => j.parameters?.jobType === 'enhance')
    res.json(enhanceJobs)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list enhance jobs')
    res.status(500).json({ error: error.message })
  }
})

// ── POST / — create a new enhancement job ────────────────────────────────────
// Accepts multipart/form-data:
//   file         — the PDF or PPTX to enhance (required)
//   mode         — 'recreate' | 'preserve'  (default: 'recreate')
//   enhancePrompt — free-text instructions from the user
//   slideCount   — optional; number of slides to target in recreate mode
router.post('/', upload.single('file'), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const tenantId = userId

    // ── Credit check ─────────────────────────────────────────────────────────
    const balance = await db.getCreditBalance(tenantId)
    if (balance < 1) {
      logger.warn({ userId, tenantId, balance }, 'Enhance job blocked: insufficient credits')
      return res.status(402).json({ error: 'Insufficient credits', balance })
    }

    // ── Validate uploaded file ────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({ error: 'A PDF or PPTX file is required.' })
    }

    const mode = (req.body?.mode as string) || 'recreate'
    if (mode !== 'recreate' && mode !== 'preserve') {
      return res.status(400).json({ error: 'mode must be "recreate" or "preserve"' })
    }

    const enhancePrompt: string = req.body?.enhancePrompt || 'Enhance and modernize this presentation.'
    const slideCount: number | undefined = req.body?.slideCount
      ? parseInt(req.body.slideCount, 10)
      : undefined

    const originalFileName = req.file.originalname
    const ext = path.extname(originalFileName).toLowerCase()

    // ── Upload input file to GCS ─────────────────────────────────────────────
    const inputPrefix = `pitch/${userId}/enhance-inputs`
    logger.info({ originalFileName, ext, userId }, 'Uploading input file to storage')
    const inputFileUrl = await storage.uploadFile(req.file.path, undefined, inputPrefix)
    logger.info({ inputFileUrl }, 'Input file uploaded')

    // ── Build job parameters ─────────────────────────────────────────────────
    const enhanceParams = {
      jobType: 'enhance',
      enhanceMode: mode,
      enhancePrompt,
      inputFileUrl,
      originalFileName,
      ...(slideCount ? { slideCount } : {}),
    }

    // ── Create DB job ────────────────────────────────────────────────────────
    const job = await db.createJob({ userId, parameters: enhanceParams }, { id: userId })

    // ── Deduct credit ────────────────────────────────────────────────────────
    await db.deductCredit(tenantId, 1, 'Presentation enhancement', { jobId: job.id })

    // ── Enqueue to dedicated enhance queue ───────────────────────────────────
    await enhanceQueue.add(
      'enhance-presentation',
      { jobId: job.id, userId: job.userId, parameters: enhanceParams },
      { jobId: job.id },
    )

    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job))
    logger.info({ jobId: job.id, userId, mode }, 'Enhance job created and queued')

    // ── Discord notification (non-blocking) ──────────────────────────────────
    db.prisma.userProfile
      .findUnique({ where: { id: userId } })
      .then(user => {
        const email = user?.email || userId
        sendDiscordMessage(
          `🪄 **Presentation Enhancement Started**\nJob ID: \`${job.id}\`\nUser: ${email}\nMode: *${mode}*\nFile: ${originalFileName}`,
        )
      })
      .catch(err => logger.error({ err }, 'Discord notification failed for enhance job'))

    res.status(201).json(job)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to create enhance job')
    res.status(500).json({ error: error.message })
  }
})

// ── GET /:id — get a single enhance job ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (job?.parameters?.jobType !== 'enhance') {
      return res.status(404).json({ error: 'Enhance job not found' })
    }
    res.json(job)
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get enhance job')
    res.status(500).json({ error: error.message })
  }
})

// ── DELETE /:id — cancel / delete an enhance job ─────────────────────────────
router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params
  try {
    const job = await db.getJob(id, { id: userId })
    if (job?.parameters?.jobType !== 'enhance') {
      return res.status(404).json({ error: 'Enhance job not found' })
    }

    // Signal the worker to abort the in-flight OpenCode session
    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }))
    logger.info({ jobId: id, userId }, 'Published enhance job cancellation signal')

    // Remove from BullMQ queue if not yet picked up
    const bullJob = await enhanceQueue.getJob(id)
    if (bullJob) {
      try {
        await bullJob.remove()
        logger.info({ jobId: id }, 'Removed enhance job from BullMQ queue')
      } catch (err: any) {
        logger.warn({ jobId: id, err: err.message }, 'Failed to remove enhance job from queue')
      }
    }

    if (job.status === JobStatus.PROCESSING) {
      let newPhases: PhaseUpdate[] = []
      if (job.phases) {
        newPhases = job.phases.map(p =>
          p.status === 'running'
            ? { ...p, status: 'failed', completedAt: new Date().toISOString() }
            : p,
        )
      }

      const failedJob = await db.updateJob(id, {
        status: JobStatus.FAILED,
        error: 'Enhancement was cancelled by the user.',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      // Refund credit
      await db.addCredits(userId, 1, 'refund', 'Refund: Enhancement cancelled', { jobId: id })
      logger.info({ jobId: id, userId }, 'Enhance job marked failed and credit refunded')
    } else {
      await db.deleteJob(id, { id: userId })
      logger.info({ jobId: id, userId }, 'Enhance job deleted')
    }

    res.status(204).send()
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete enhance job')
    res.status(500).json({ error: error.message })
  }
})
