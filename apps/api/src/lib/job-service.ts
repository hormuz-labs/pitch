import * as db from '@saas/db'
import { createLogger, JOB_UPDATES_CHANNEL, JobStatus, sendDiscordMessage } from '@saas/shared'
import * as storage from '@saas/storage'
import { connection, editQueue, enhanceQueue, videoQueue } from '../config.js'

const logger = createLogger('api')
const pdfLogger = createLogger('api:pdf')
const enhanceLogger = createLogger('api:enhance')
const editLogger = createLogger('api:edit')

export const EDIT_CREDIT_COST = 2

/** Thrown when the user's credit balance cannot cover the job. Carries the
 * current balance so HTTP routes can map it to 402 and MCP tools to a tool error. */
export class InsufficientCreditsError extends Error {
  balance: number
  constructor(balance: number) {
    super(`Insufficient credits (balance: ${balance})`)
    this.name = 'InsufficientCreditsError'
    this.balance = balance
  }
}

/** AI demo video job (3 credits). Rolls back (mark failed + refund) when the
 * enqueue/publish step fails after the job row and credit deduction committed. */
export async function createDemoVideoJob(userId: string, parameters: any) {
  const tenantId = userId
  const requiresReview = Array.isArray(parameters?.assets) && parameters.assets.length > 0
  const jobParameters = requiresReview ? { ...parameters, workflowStage: 'PLANNING' } : parameters

  const balance = await db.getCreditBalance(tenantId)
  if (balance < 3) {
    logger.warn({ userId, tenantId, balance }, 'Job creation blocked: insufficient credits')
    throw new InsufficientCreditsError(balance)
  }

  const job = await db.createJob({ userId, parameters: jobParameters }, { id: userId })

  await db.deductCredit(tenantId, 3, 'Video generation', { jobId: job.id })

  try {
    await videoQueue.add(
      'generate-video',
      {
        jobId: job.id,
        userId: job.userId,
        parameters: jobParameters,
        ...(requiresReview ? { mode: 'plan' } : {}),
      },
      { jobId: job.id },
    )
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job))
  } catch (enqueueError: any) {
    // The DB job + credit deduction above already committed. Without this
    // rollback, a transient queue/Redis failure here leaves an orphaned
    // PENDING job that the worker will never pick up and silently keeps
    // the user's credits spent.
    logger.error(
      { err: enqueueError, jobId: job.id, userId },
      'Failed to enqueue job after creation — rolling back (refund + mark failed)',
    )
    await db.updateJob(job.id, {
      status: JobStatus.FAILED,
      error: `Failed to queue job: ${enqueueError.message}`,
    })
    await db.addCredits(tenantId, 3, 'refund', 'Refund: job failed to enqueue', {
      jobId: job.id,
    })
    throw enqueueError
  }

  logger.info({ jobId: job.id, userId, tenantId }, 'Job created and queued')

  db.prisma.userProfile
    .findUnique({ where: { id: userId } })
    .then(user => {
      const email = user?.email || userId
      const url = parameters?.url || 'N/A'
      const instructions = parameters?.instructions ? `\nPrompt: *${parameters.instructions}*` : ''
      sendDiscordMessage(
        `🎬 **New Video Creation Started**\nJob ID: \`${job.id}\`\nUser: ${email}\nURL: ${url}${instructions}`,
      )
    })
    .catch(err => logger.error({ err }, 'Failed to send Discord notification for job creation'))

  return job
}

/** PDF job (1 credit). Forces jobType: 'pdf' onto the parameters; queued on
 * the shared video queue where the worker dispatches by jobType. */
export async function createPdfJob(userId: string, parameters: any) {
  const tenantId = userId

  const balance = await db.getCreditBalance(tenantId)
  if (balance < 1) {
    pdfLogger.warn({ userId, tenantId, balance }, 'PDF job creation blocked: insufficient credits')
    throw new InsufficientCreditsError(balance)
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

  pdfLogger.info({ jobId: job.id, userId, tenantId }, 'PDF job created and queued')

  db.prisma.userProfile
    .findUnique({ where: { id: userId } })
    .then(user => {
      const email = user?.email || userId
      const topic = parameters?.topic || 'N/A'
      sendDiscordMessage(
        `📄 **New PDF Creation Started**\nJob ID: \`${job.id}\`\nUser: ${email}\nTopic: *${topic}*`,
      )
    })
    .catch(err =>
      pdfLogger.error({ err }, 'Failed to send Discord notification for PDF job creation'),
    )

  return job
}

export interface EnhanceJobInput {
  tmpFilePath: string
  originalFileName: string
  mode: 'recreate' | 'preserve'
  enhancePrompt: string
  slideCount?: number
}

/** Presentation enhance job (1 credit). Uploads the local temp file to
 * storage, then queues on the dedicated enhance queue. */
export async function createEnhanceJob(userId: string, input: EnhanceJobInput) {
  const tenantId = userId
  const { tmpFilePath, originalFileName, mode, enhancePrompt, slideCount } = input

  // ── Credit check ─────────────────────────────────────────────────────────
  const balance = await db.getCreditBalance(tenantId)
  if (balance < 1) {
    enhanceLogger.warn({ userId, tenantId, balance }, 'Enhance job blocked: insufficient credits')
    throw new InsufficientCreditsError(balance)
  }

  // ── Upload input file to GCS ─────────────────────────────────────────────
  const inputPrefix = `pitch/${userId}/enhance-inputs`
  enhanceLogger.info({ originalFileName, userId }, 'Uploading input file to storage')
  const inputFileUrl = await storage.uploadFile(tmpFilePath, undefined, inputPrefix)
  enhanceLogger.info({ inputFileUrl }, 'Input file uploaded')

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
  enhanceLogger.info({ jobId: job.id, userId, mode }, 'Enhance job created and queued')

  // ── Discord notification (non-blocking) ──────────────────────────────────
  db.prisma.userProfile
    .findUnique({ where: { id: userId } })
    .then(user => {
      const email = user?.email || userId
      sendDiscordMessage(
        `🪄 **Presentation Enhancement Started**\nJob ID: \`${job.id}\`\nUser: ${email}\nMode: *${mode}*\nFile: ${originalFileName}`,
      )
    })
    .catch(err => enhanceLogger.error({ err }, 'Discord notification failed for enhance job'))

  return job
}

export interface EditJobInput {
  tmpFilePath: string
  originalFileName: string
  productName?: string
  productUrl?: string
  instructions?: string
}

/** Recording edit job (EDIT_CREDIT_COST credits). Uploads the local temp file
 * to storage, then queues on the dedicated edit queue. */
export async function createEditJob(userId: string, input: EditJobInput) {
  const tenantId = userId
  const { tmpFilePath, originalFileName, productName, productUrl, instructions } = input

  // ── Credit check ─────────────────────────────────────────────────────────
  const balance = await db.getCreditBalance(tenantId)
  if (balance < EDIT_CREDIT_COST) {
    editLogger.warn({ userId, tenantId, balance }, 'Edit job blocked: insufficient credits')
    throw new InsufficientCreditsError(balance)
  }

  // ── Upload input file to storage ─────────────────────────────────────────
  const inputPrefix = `pitch/${userId}/edit-inputs`
  editLogger.info({ originalFileName, userId }, 'Uploading recording to storage')
  const inputFileUrl = await storage.uploadFile(tmpFilePath, undefined, inputPrefix)
  editLogger.info({ inputFileUrl }, 'Recording uploaded')

  // ── Build job parameters ─────────────────────────────────────────────────
  // `url` mirrors the demo-job parameter so downstream consumers that read
  // parameters.url (result naming, editor title, notifications) work unchanged.
  const editParams = {
    jobType: 'edit-recording',
    inputFileUrl,
    originalFileName,
    ...(productName ? { productName } : {}),
    ...(productUrl ? { productUrl } : {}),
    ...(instructions ? { instructions } : {}),
    url: productUrl || originalFileName,
  }

  const job = await db.createJob({ userId, parameters: editParams }, { id: userId })

  await db.deductCredit(tenantId, EDIT_CREDIT_COST, 'Recording edit', { jobId: job.id })

  await editQueue.add(
    'edit-recording',
    { jobId: job.id, userId: job.userId, parameters: editParams },
    { jobId: job.id },
  )

  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job))
  editLogger.info({ jobId: job.id, userId }, 'Edit job created and queued')

  // ── Discord notification (non-blocking) ──────────────────────────────────
  db.prisma.userProfile
    .findUnique({ where: { id: userId } })
    .then(user => {
      const email = user?.email || userId
      sendDiscordMessage(
        `🎞️ **Recording Edit Started**\nJob ID: \`${job.id}\`\nUser: ${email}\nFile: ${originalFileName}`,
      )
    })
    .catch(err => editLogger.error({ err }, 'Discord notification failed for edit job'))

  return job
}
