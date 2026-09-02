import * as db from '@saas/db'
import {
  approveVideoStoryboard,
  createLogger,
  deriveJobTitle,
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
  updateVideoStoryboard,
} from '@saas/shared'
import { Router } from 'express'
import { connection, subscriber, videoQueue } from '../config.js'
import { createDemoVideoJob, InsufficientCreditsError, OnboardingRequiredError } from '../lib/job-service.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const jobs = await db.listJobs({ id: userId })
    const videoJobs = jobs.filter(
      j => j.parameters?.jobType !== 'pdf' && j.parameters?.jobType !== 'enhance',
    )
    res.json(videoJobs)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list jobs')
    res.status(500).json({ error: error.message })
  }
})

router.post('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  const { parameters } = req.body as { parameters: any }

  try {
    const job = await createDemoVideoJob(userId, parameters)
    res.status(201).json(job)
  } catch (error: any) {
    if (error instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: 'Insufficient credits', balance: error.balance })
    }
    if (error instanceof OnboardingRequiredError) return res.status(428).json({ error: error.message })
    logger.error({ err: error, userId }, 'Failed to create job')
    res.status(500).json({ error: error.message })
  }
})

// Unauthenticated — fetched client-side by PublicDemoView (apps/web) after
// the meta-injection HTML from GET /d/:slug (apps/api/src/routes/share.ts)
// has already booted the SPA. Only ever returns the safe, public field
// subset — never the full job row (no userId, cost, parameters, etc.).
router.get('/public/:slug', async (req, res) => {
  try {
    const job = await db.getPublicJobBySlug(req.params.slug)
    if (!job || job.status !== JobStatus.COMPLETED || !job.videoUrl) {
      return res.status(404).json({ error: 'Not found' })
    }

    db.incrementShareViews(job.id).catch(err =>
      logger.warn({ err, jobId: job.id }, 'Failed to bump shareViews'),
    )

    res.json({
      title: deriveJobTitle(job.parameters),
      videoUrl: job.videoUrl,
      thumbnailUrl: job.thumbnailUrl,
      createdAt: job.createdAt,
    })
  } catch (error: any) {
    logger.error({ err: error, slug: req.params.slug }, 'Failed to load public job')
    res.status(500).json({ error: error.message })
  }
})

router.get('/stream', (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const _currentTenantId = userId
  logger.info({ userId, tenantId: userId }, 'SSE stream connected')

  const handler = (channel: string, message: string) => {
    if (channel === JOB_UPDATES_CHANNEL) {
      try {
        const data = JSON.parse(message)
        if (data.userId === userId || data.job?.userId === userId) {
          res.write(`data: ${message}\n\n`)
        }
      } catch (e) {
        logger.error({ err: e, userId }, 'Failed to parse SSE message')
      }
    }
  }

  subscriber.subscribe(JOB_UPDATES_CHANNEL)
  subscriber.on('message', handler)

  req.on('close', () => {
    subscriber.off('message', handler)
    logger.info({ userId, tenantId: userId }, 'SSE stream disconnected')
  })
})

router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(job)
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get job')
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/feedback', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params
  const { rating, feedback } = req.body

  try {
    const job = await db.getJob(id, { id: userId })

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const updatedJob = await db.updateJob(id, { rating, feedback })
    logger.info({ jobId: id, userId, rating }, 'Job feedback submitted')
    res.json(updatedJob)
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to submit feedback')
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id/editions', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(await db.listVideoEditions(job.id))
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to list video editions')
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/share', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    await db.makeJobPublic(req.params.id, { id: userId })
    const job = await db.getJob(req.params.id, { id: userId })
    res.json(job)
  } catch (error: any) {
    if (error.message === 'Job not found') {
      return res.status(404).json({ error: 'Job not found' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to share job')
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id/share', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })

    await db.unmakeJobPublic(req.params.id, { id: userId })
    res.json({ ...job, isPublic: false })
  } catch (error: any) {
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to unshare job')
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/edit', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params
  let chargedRevision: number | null = null
  try {
    const job = await db.getJob(id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.status !== JobStatus.COMPLETED) {
      return res.status(409).json({ error: 'Only a completed video can be edited.' })
    }
    const currentStoryboard = job.parameters?.storyboard
    if (!currentStoryboard) {
      return res.status(409).json({ error: 'This video has no storyboard to edit.' })
    }
    if (!job.videoUrl) {
      return res.status(409).json({ error: 'This job has no completed video to preserve.' })
    }

    const currentEdition = await db.saveVideoEdition({
      jobId: job.id,
      videoUrl: job.videoUrl,
      rawVideoUrl: job.rawVideoUrl,
      audioUrl: job.audioUrl,
      thumbnailUrl: job.thumbnailUrl,
      storyboard: currentStoryboard,
    })
    const requestedEditionId = req.body?.editionId
    const sourceEdition = requestedEditionId
      ? await db.getVideoEdition(job.id, requestedEditionId)
      : currentEdition
    if (!sourceEdition) return res.status(404).json({ error: 'Video edition not found' })
    if (!sourceEdition.storyboard) {
      return res.status(409).json({ error: 'This video edition has no storyboard to edit.' })
    }

    const balance = await db.getCreditBalance(userId)
    if (balance < 3) return res.status(402).json({ error: 'Insufficient credits', balance })

    // db types the stored storyboard as Record<string, unknown>, so the nested
    // revision arrives as `unknown`. Narrow it rather than trusting the shape.
    const storedRevision = sourceEdition.storyboard.revision
    chargedRevision =
      sourceEdition.storyboardRevision ??
      (typeof storedRevision === 'number' ? storedRevision : null)
    const idempotencyKey = `video_edit:${id}:from:${sourceEdition.id}:after:${currentEdition.id}`
    await db.deductCredit(userId, 3, 'Video editing', { jobId: id, idempotencyKey })

    const storyboard: Record<string, unknown> = {
      ...sourceEdition.storyboard,
      status: 'draft' as const,
    }
    delete storyboard.approvedRevision
    let updatedJob
    try {
      updatedJob = await db.updateJob(id, {
        status: JobStatus.AWAITING_REVIEW,
        parameters: {
          ...job.parameters,
          workflowStage: 'AWAITING_REVIEW',
          storyboard,
        },
      })
    } catch (transitionError) {
      await db.addCredits(userId, 3, 'refund', 'Refund: video could not enter editing', {
        jobId: id,
        idempotencyKey: `refund:${idempotencyKey}`,
      })
      throw transitionError
    }

    await connection
      .publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
      .catch(error => logger.warn({ err: error, jobId: id, userId }, 'Edit update publish failed'))
    res.json(updatedJob)
  } catch (error: any) {
    if (error.message?.includes('Insufficient credits')) {
      return res.status(402).json({ error: 'Insufficient credits' })
    }
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId, chargedRevision }, 'Failed to edit video')
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id/storyboard', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (
      job.status !== JobStatus.AWAITING_REVIEW ||
      job.parameters?.workflowStage !== 'AWAITING_REVIEW'
    ) {
      return res.status(409).json({ error: 'This storyboard is no longer editable.' })
    }
    const current = job.parameters?.storyboard
    if (!current) return res.status(409).json({ error: 'This job has no storyboard to review.' })

    const storyboard = updateVideoStoryboard(current, {
      revision: req.body?.revision,
      transition: req.body?.transition,
      titleCards: req.body?.titleCards,
      scenes: req.body?.scenes,
    })
    const updatedJob = await db.updateJob(req.params.id, {
      parameters: {
        ...job.parameters,
        workflowStage: 'AWAITING_REVIEW',
        storyboard,
      },
    })
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
    res.json(updatedJob)
  } catch (error: any) {
    if (error.message?.includes('revision conflict')) {
      return res.status(409).json({ error: error.message })
    }
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to save storyboard')
    res.status(400).json({ error: error.message })
  }
})

router.post('/:id/render', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const job = await db.getJob(req.params.id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.parameters?.workflowStage !== 'AWAITING_REVIEW') {
      return res.status(409).json({ error: 'This job is not waiting for storyboard review.' })
    }
    const current = job.parameters?.storyboard
    if (!current) return res.status(409).json({ error: 'This job has no storyboard to render.' })

    const storyboard = approveVideoStoryboard(current, req.body?.revision)
    const parameters = {
      ...job.parameters,
      workflowStage: 'RENDER_QUEUED',
      storyboard,
    }
    const updatedJob = await db.updateJob(req.params.id, {
      status: JobStatus.PENDING,
      phases: '[]',
      cost: 0,
      error: null,
      workerId: null,
      parameters,
    })
    try {
      await videoQueue.add(
        'generate-video',
        { jobId: job.id, userId: job.userId, parameters, mode: 'render' },
        { jobId: `${job.id}-render-r${storyboard.revision}` },
      )
    } catch (enqueueError: any) {
      const restoredJob = await db.updateJob(req.params.id, {
        status: JobStatus.AWAITING_REVIEW,
        parameters: {
          ...job.parameters,
          workflowStage: 'AWAITING_REVIEW',
          storyboard: current,
        },
      })
      await connection
        .publish(JOB_UPDATES_CHANNEL, JSON.stringify(restoredJob))
        .catch(() => undefined)
      const unavailable = new Error(`Render queue unavailable: ${enqueueError.message}`)
      unavailable.name = 'RenderQueueUnavailable'
      throw unavailable
    }
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
    res.status(202).json(updatedJob)
  } catch (error: any) {
    if (error.name === 'RenderQueueUnavailable') {
      return res.status(503).json({ error: error.message })
    }
    if (error.message?.includes('revision conflict')) {
      return res.status(409).json({ error: error.message })
    }
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to queue storyboard render')
    res.status(400).json({ error: error.message })
  }
})

router.post('/:id/retrigger', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params

  try {
    const job = await db.getJob(id, { id: userId })

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const balance = await db.getCreditBalance(userId)
    if (balance < 3) {
      return res.status(402).json({ error: 'Insufficient credits', balance })
    }

    const updatedJob = await db.updateJob(id, { status: JobStatus.PENDING, videoUrl: undefined })
    await db.deductCredit(userId, 3, 'Video generation (retry)', { jobId: updatedJob.id })

    const existingJob = await videoQueue.getJob(id)
    if (existingJob) {
      await existingJob.remove()
      logger.info({ jobId: id, userId }, 'Removed stale BullMQ job before retrigger')
    }

    await videoQueue.add(
      'generate-video',
      { jobId: updatedJob.id, userId: updatedJob.userId, parameters: updatedJob.parameters },
      { jobId: updatedJob.id },
    )

    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))

    logger.info({ jobId: id, userId }, 'Job retriggered')
    res.json(updatedJob)
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to retrigger job')
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { id } = req.params
  try {
    const job = await db.getJob(id, { id: userId })
    if (!job) return res.status(404).json({ error: 'Job not found' })

    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }))
    logger.info({ jobId: id, userId }, 'Published job cancellation signal')

    const approvedRevision = job.parameters?.storyboard?.approvedRevision
    const queueJobIds = [
      id,
      ...(Number.isInteger(approvedRevision) ? [`${id}-render-r${approvedRevision}`] : []),
    ]
    for (const queueJobId of queueJobIds) {
      const bullJob = await videoQueue.getJob(queueJobId)
      if (bullJob) {
        try {
          await bullJob.remove()
          logger.info({ jobId: id, queueJobId, userId }, 'Removed job from BullMQ queue')
        } catch (err: any) {
          logger.warn(
            { jobId: id, queueJobId, userId, err: err.message },
            'Failed to remove job from BullMQ (possibly locked/active)',
          )
        }
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
        error: 'Video generation was cancelled/aborted by the user.',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      // Refund credits
      await db.addCredits(userId, 3, 'refund', 'Refund: video generation cancelled', { jobId: id })
      logger.info({ jobId: id, userId }, 'Job marked as failed and credits refunded')
    } else {
      await db.deleteJob(id, { id: userId })
      logger.info({ jobId: id, userId }, 'Job deleted')
    }
    res.status(204).send()
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete job')
    res.status(500).json({ error: error.message })
  }
})
