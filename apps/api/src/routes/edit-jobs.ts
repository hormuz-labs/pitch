import * as db from '@saas/db'
import {
  createLogger,
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
} from '@saas/shared'
import { Router } from 'express'
import multer from 'multer'
import * as os from 'os'
import * as path from 'path'
import { connection, editQueue } from '../config.js'
import { createEditJob, EDIT_CREDIT_COST, InsufficientCreditsError, OnboardingRequiredError } from '../lib/job-service.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:edit')
export const router = Router()

// ── Multer: accept common screen-recording formats up to 500 MB ──────────────
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter(_req, file, cb) {
    const allowed = ['.mp4', '.webm', '.mov', '.mkv', '.avi']
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowed.includes(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`))
    }
    cb(null, true)
  },
})

// ── GET / — list all edit jobs for the authenticated user ────────────────────
router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const jobs = await db.listJobs({ id: userId })
    res.json(jobs.filter(j => j.parameters?.jobType === 'edit-recording'))
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list edit jobs')
    res.status(500).json({ error: error.message })
  }
})

// ── POST / — create a new edit-recording job ─────────────────────────────────
// Accepts multipart/form-data:
//   file        — the narrated screen recording (required)
//   productName — optional, used on the intro card
//   productUrl  — optional, used on the outro card
//   instructions — optional, extra guidance for the editing agent
router.post('/', upload.single('file'), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A video file is required.' })
    }

    const job = await createEditJob(userId, {
      tmpFilePath: req.file.path,
      originalFileName: req.file.originalname,
      productName: req.body?.productName?.trim() || undefined,
      productUrl: req.body?.productUrl?.trim() || undefined,
      instructions: req.body?.instructions?.trim() || undefined,
    })

    res.status(201).json(job)
  } catch (error: any) {
    if (error instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: 'Insufficient credits', balance: error.balance })
    }
    if (error instanceof OnboardingRequiredError) return res.status(428).json({ error: error.message })
    logger.error({ err: error, userId }, 'Failed to create edit job')
    res.status(500).json({ error: error.message })
  }
})

// ── GET /:id — get a single edit job ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (job?.parameters?.jobType !== 'edit-recording') {
      return res.status(404).json({ error: 'Edit job not found' })
    }
    res.json(job)
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get edit job')
    res.status(500).json({ error: error.message })
  }
})

// ── DELETE /:id — cancel / delete an edit job ────────────────────────────────
router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params
  try {
    const job = await db.getJob(id, { id: userId })
    if (job?.parameters?.jobType !== 'edit-recording') {
      return res.status(404).json({ error: 'Edit job not found' })
    }

    // Signal the worker to abort the in-flight OpenCode session
    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }))
    logger.info({ jobId: id, userId }, 'Published edit job cancellation signal')

    const bullJob = await editQueue.getJob(id)
    if (bullJob) {
      try {
        await bullJob.remove()
        logger.info({ jobId: id }, 'Removed edit job from BullMQ queue')
      } catch (err: any) {
        logger.warn({ jobId: id, err: err.message }, 'Failed to remove edit job from queue')
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
        error: 'Recording edit was cancelled by the user.',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      await db.addCredits(userId, EDIT_CREDIT_COST, 'refund', 'Refund: Recording edit cancelled', {
        jobId: id,
      })
      logger.info({ jobId: id, userId }, 'Edit job marked failed and credits refunded')
    } else {
      await db.deleteJob(id, { id: userId })
      logger.info({ jobId: id, userId }, 'Edit job deleted')
    }
    res.status(204).send()
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete edit job')
    res.status(500).json({ error: error.message })
  }
})
