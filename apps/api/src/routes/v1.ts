/**
 * /v1 — the public REST API.
 *
 * Authenticated by the same `pk_` API keys as /mcp (see middleware/auth.ts), so
 * an agent can use MCP and a script can use REST with one key. Every create
 * route calls the shared services in lib/job-service.ts, which means the credit
 * gate, deduction, and ledger entry are identical to the browser app.
 *
 * Mounted before clerkMiddleware in index.ts with its own body parser: Clerk
 * must never see these bearer tokens, and base64 uploads exceed the global JSON
 * limit.
 */
import * as db from '@saas/db'
import {
  createLogger,
  DEFAULT_LAUNCH_VIDEO_RESOLUTION,
  LAUNCH_VIDEO_RESOLUTIONS,
  launchVideoCreditCost,
} from '@saas/shared'
import { Router } from 'express'
import { z } from 'zod'
import {
  EDIT_EXTS,
  EDIT_MAX_BYTES,
  ENHANCE_EXTS,
  ENHANCE_MAX_BYTES,
  stageBase64Upload,
} from '../lib/base64-upload.js'
import {
  createDemoVideoJob,
  createEditJob,
  createEnhanceJob,
  createLaunchVideoJob,
  createPdfJob,
  InsufficientCreditsError,
} from '../lib/job-service.js'
import { getProject, listProjects } from '../lib/launch-video/projects.js'
import { resolveApiKey } from '../middleware/auth.js'

const logger = createLogger('api:v1')

export const router = Router()

// ── error envelope ──────────────────────────────────────────────────────────

type ErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'insufficient_credits'
  | 'not_found'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal_error'

const fail = (
  res: any,
  status: number,
  code: ErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) => res.status(status).json({ error: { code, message, ...extra } })

/** Map a thrown error onto the documented status codes. */
const failFromError = (res: any, error: unknown, context: string) => {
  if (error instanceof InsufficientCreditsError) {
    return fail(
      res,
      402,
      'insufficient_credits',
      `Not enough credits. Balance is ${error.balance}. Buy more at https://trypitch.co/pricing.`,
      { balance: error.balance },
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/too large/i.test(message)) return fail(res, 413, 'payload_too_large', message)
  if (/unsupported file type/i.test(message))
    return fail(res, 415, 'unsupported_media_type', message)
  if (/empty file/i.test(message)) return fail(res, 400, 'invalid_request', message)

  logger.error({ err: error }, `${context} failed`)
  return fail(res, 500, 'internal_error', 'Something broke on our side. Retry, or email support.')
}

/** Parse a body with zod and answer 400 with the field paths when it fails. */
const parseBody = <T>(res: any, schema: z.ZodType<T>, body: unknown): T | null => {
  const result = schema.safeParse(body)
  if (result.success) return result.data
  const detail = result.error.issues
    .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
  fail(res, 400, 'invalid_request', detail)
  return null
}

// ── job serialization ───────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL || 'https://trypitch.co'

/** The public job type, derived from the internal parameters.jobType marker. */
const jobType = (parameters: any): string => {
  const t = parameters?.jobType
  if (t === 'pdf') return 'deck'
  if (t === 'enhance') return 'deck.enhance'
  if (t === 'edit-recording') return 'recording.edit'
  if (t === 'launch-video') return 'launch_video'
  return 'video'
}

/**
 * Only the fields a caller should see. The raw row carries internals (workerId,
 * gitHash, the full parameter blob) that are not part of the contract.
 */
const serializeJob = (job: any) => ({
  id: job.id,
  type: jobType(job.parameters),
  status: job.status,
  progress: job.progress ?? 0,
  cost: job.cost ?? 0,
  videoUrl: job.videoUrl ?? null,
  pdfUrl: job.pdfUrl ?? null,
  thumbnailUrl: job.thumbnailUrl ?? null,
  shareUrl: job.shareSlug ? `${APP_URL}/d/${job.shareSlug}` : null,
  error: job.error ?? null,
  phases: (job.phases ?? []).map((p: any) => ({
    phase: p.phase,
    label: p.label,
    status: p.status,
  })),
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
})

// ── public ──────────────────────────────────────────────────────────────────

/** Static price list, so a caller can budget before it even has a key. Declared
 *  above the auth guard on purpose. */
router.get('/pricing', (_req, res) => {
  res.json({
    video: 3,
    deck: 1,
    'deck.enhance': 1,
    'recording.edit': 2,
    launch_video: {
      default: launchVideoCreditCost(DEFAULT_LAUNCH_VIDEO_RESOLUTION, true),
      byResolution: Object.fromEntries(
        Object.keys(LAUNCH_VIDEO_RESOLUTIONS).map(r => [
          r,
          { narrated: launchVideoCreditCost(r, true), musicOnly: launchVideoCreditCost(r, false) },
        ]),
      ),
    },
  })
})

// ── auth ────────────────────────────────────────────────────────────────────

router.use(async (req, res, next) => {
  const userId = await resolveApiKey(req)
  if (!userId) {
    return fail(res, 401, 'unauthorized', 'Invalid or revoked API key')
  }
  ;(req as any).apiUserId = userId
  next()
})

const uid = (req: any): string => req.apiUserId

// ── create: demo video ──────────────────────────────────────────────────────

const videoSchema = z.object({
  url: z.string().url(),
  instructions: z.string().optional(),
  script: z.string().optional(),
  voice: z.string().optional(),
  assets: z.array(z.string().url()).optional(),
})

router.post('/videos', async (req, res) => {
  const body = parseBody(res, videoSchema, req.body)
  if (!body) return
  try {
    const job = await createDemoVideoJob(uid(req), body)
    res.status(202).json(serializeJob(job))
  } catch (error) {
    failFromError(res, error, 'POST /v1/videos')
  }
})

// ── create: launch video ────────────────────────────────────────────────────

const launchSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine(n => /^[^/\\]+$/.test(n) && !n.startsWith('.') && n !== '.' && n !== '..', {
      message: 'cannot contain / or \\, start with ".", or be "." or ".."',
    }),
  prompt: z.string().min(1),
  music: z.string().optional(),
  resolution: z.enum(['720p', '1080p', '4k']).optional(),
  narration: z.boolean().optional(),
})

router.post('/launch-videos', async (req, res) => {
  const body = parseBody(res, launchSchema, req.body)
  if (!body) return
  try {
    const job = await createLaunchVideoJob(
      uid(req),
      body.name,
      body.prompt,
      body.music,
      body.resolution,
      body.narration ?? true,
    )
    res.status(202).json(serializeJob(job))
  } catch (error) {
    failFromError(res, error, 'POST /v1/launch-videos')
  }
})

// ── create: deck ────────────────────────────────────────────────────────────

const deckSchema = z.object({
  topic: z.string().min(1),
  instructions: z.string().optional(),
})

router.post('/decks', async (req, res) => {
  const body = parseBody(res, deckSchema, req.body)
  if (!body) return
  try {
    const job = await createPdfJob(uid(req), body)
    res.status(202).json(serializeJob(job))
  } catch (error) {
    failFromError(res, error, 'POST /v1/decks')
  }
})

// ── create: deck enhance ────────────────────────────────────────────────────

const enhanceSchema = z.object({
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
  mode: z.enum(['recreate', 'preserve']).optional(),
  enhancePrompt: z.string().optional(),
  slideCount: z.number().int().positive().optional(),
})

router.post('/decks/enhance', async (req, res) => {
  const body = parseBody(res, enhanceSchema, req.body)
  if (!body) return
  try {
    const tmpFilePath = await stageBase64Upload(
      body.fileBase64,
      body.fileName,
      ENHANCE_EXTS,
      ENHANCE_MAX_BYTES,
    )
    const job = await createEnhanceJob(uid(req), {
      tmpFilePath,
      originalFileName: body.fileName,
      mode: body.mode ?? 'recreate',
      enhancePrompt: body.enhancePrompt ?? 'Enhance and modernize this presentation.',
      slideCount: body.slideCount,
    })
    res.status(202).json(serializeJob(job))
  } catch (error) {
    failFromError(res, error, 'POST /v1/decks/enhance')
  }
})

// ── create: recording edit ──────────────────────────────────────────────────

const editSchema = z.object({
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
  productName: z.string().optional(),
  productUrl: z.string().optional(),
  instructions: z.string().optional(),
})

router.post('/recordings/edit', async (req, res) => {
  const body = parseBody(res, editSchema, req.body)
  if (!body) return
  try {
    const tmpFilePath = await stageBase64Upload(
      body.fileBase64,
      body.fileName,
      EDIT_EXTS,
      EDIT_MAX_BYTES,
    )
    const job = await createEditJob(uid(req), {
      tmpFilePath,
      originalFileName: body.fileName,
      productName: body.productName,
      productUrl: body.productUrl,
      instructions: body.instructions,
    })
    res.status(202).json(serializeJob(job))
  } catch (error) {
    failFromError(res, error, 'POST /v1/recordings/edit')
  }
})

// ── read: jobs ──────────────────────────────────────────────────────────────

const TYPE_FILTERS: Record<string, (p: any) => boolean> = {
  video: p => !['pdf', 'enhance', 'edit-recording', 'launch-video'].includes(p?.jobType),
  launch_video: p => p?.jobType === 'launch-video',
  deck: p => p?.jobType === 'pdf',
  'deck.enhance': p => p?.jobType === 'enhance',
  'recording.edit': p => p?.jobType === 'edit-recording',
}

router.get('/jobs', async (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  if (type && !TYPE_FILTERS[type]) {
    return fail(
      res,
      400,
      'invalid_request',
      `Unknown type "${type}". Use one of: ${Object.keys(TYPE_FILTERS).join(', ')}.`,
    )
  }
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  try {
    const jobs = await db.listJobs({ id: uid(req) })
    const filtered = type ? jobs.filter(j => TYPE_FILTERS[type](j.parameters)) : jobs
    res.json({ data: filtered.slice(0, limit).map(serializeJob), total: filtered.length })
  } catch (error) {
    failFromError(res, error, 'GET /v1/jobs')
  }
})

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await db.getJob(req.params.id, { id: uid(req) })
    if (!job) return fail(res, 404, 'not_found', `No job with id ${req.params.id}.`)
    res.json(serializeJob(job))
  } catch (error) {
    failFromError(res, error, 'GET /v1/jobs/:id')
  }
})

// ── read: launch video projects ─────────────────────────────────────────────

router.get('/launch-videos', async (req, res) => {
  try {
    res.json({ data: await listProjects(uid(req)) })
  } catch (error) {
    failFromError(res, error, 'GET /v1/launch-videos')
  }
})

router.get('/launch-videos/:name', async (req, res) => {
  const name = req.params.name
  if (!/^[^/\\]+$/.test(name) || name.startsWith('.')) {
    return fail(res, 400, 'invalid_request', 'Invalid project name.')
  }
  try {
    const project = await getProject(uid(req), name)
    if (!project) return fail(res, 404, 'not_found', `No launch video project named "${name}".`)
    res.json(project)
  } catch (error) {
    failFromError(res, error, 'GET /v1/launch-videos/:name')
  }
})

// ── read: credits and pricing ───────────────────────────────────────────────

router.get('/credits', async (req, res) => {
  try {
    const summary = await db.getCreditSummary(uid(req))
    res.json({
      balance: summary.balance,
      plan: summary.activeSubscription?.planKey ?? null,
      transactions: summary.transactions.slice(0, 20),
    })
  } catch (error) {
    failFromError(res, error, 'GET /v1/credits')
  }
})
