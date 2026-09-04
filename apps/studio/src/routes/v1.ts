/**
 * Public REST API (API keys). Projects are the resource:
 *   POST /v1/projects            { flow, prompt, options?, uploads?[{fileBase64,fileName}] }
 *   GET  /v1/projects?flow=&limit=
 *   GET  /v1/projects/:id
 *   POST /v1/projects/:id/prompt { text, scene?, slide? }
 *   POST /v1/projects/:id/export { res? }   GET /v1/projects/:id/export
 *   GET  /v1/credits, GET /v1/pricing
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { z } from 'zod'
import {
  createFromApi,
  createSchema,
  exportFromApi,
  exportStatusFromApi,
  getFromApi,
  listFromApi,
  pricing,
  promptFromApi,
} from '../lib/public-api.js'
import { resolveApiKey } from '../middleware/auth.js'
import { InsufficientCreditsError } from '../projects/service.js'

const logger = createLogger('studio:v1')
export const router: Router = Router()

const fail = (
  res: any,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) => res.status(status).json({ error: { code, message, ...extra } })

const failFromError = (res: any, error: unknown, context: string) => {
  if (error instanceof InsufficientCreditsError)
    return fail(
      res,
      402,
      'insufficient_credits',
      `Not enough credits. Balance is ${error.balance}. Buy more at https://trypitch.co/pricing.`,
      { balance: error.balance },
    )
  const status = (error as any)?.status
  const message = error instanceof Error ? error.message : String(error)
  if (status === 404) return fail(res, 404, 'not_found', message)
  if (status === 409 || (error as any)?.code === 'BUSY') return fail(res, 409, 'busy', message)
  if (status === 428) return fail(res, 428, 'onboarding_required', message)
  if (status === 400) return fail(res, 400, 'invalid_request', message)
  if (/too large/i.test(message)) return fail(res, 413, 'payload_too_large', message)
  if (/unsupported file type/i.test(message))
    return fail(res, 415, 'unsupported_media_type', message)
  logger.error({ err: error }, `${context} failed`)
  return fail(res, 500, 'internal_error', 'Something broke on our side. Retry, or email support.')
}

const parseBody = <T>(res: any, schema: z.ZodType<T>, body: unknown): T | null => {
  const result = schema.safeParse(body)
  if (result.success) return result.data
  fail(
    res,
    400,
    'invalid_request',
    result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
  )
  return null
}

router.get('/pricing', (_req, res) => res.json(pricing()))

router.use(async (req, res, next) => {
  try {
    const userId = await resolveApiKey(req)
    if (!userId) return fail(res, 401, 'unauthorized', 'Invalid or revoked API key')
    ;(req as any).apiUserId = userId
    next()
  } catch (error) {
    failFromError(res, error, 'API key lookup')
  }
})
const uid = (req: any): string => req.apiUserId

router.post('/projects', async (req, res) => {
  const body = parseBody(res, createSchema, req.body)
  if (!body) return
  try {
    res.status(202).json(await createFromApi(uid(req), body))
  } catch (error) {
    failFromError(res, error, 'POST /v1/projects')
  }
})

router.get('/projects', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const data = await listFromApi(
      uid(req),
      typeof req.query.flow === 'string' ? req.query.flow : undefined,
      limit,
    )
    res.json({ data, total: data.length })
  } catch (error) {
    failFromError(res, error, 'GET /v1/projects')
  }
})

router.get('/projects/:id', async (req, res) => {
  try {
    res.json(await getFromApi(uid(req), req.params.id))
  } catch (error) {
    failFromError(res, error, 'GET /v1/projects/:id')
  }
})

const promptSchema = z.object({
  text: z.string().min(1),
  scene: z.string().optional(),
  slide: z.number().int().optional(),
})
router.post('/projects/:id/prompt', async (req, res) => {
  const body = parseBody(res, promptSchema, req.body)
  if (!body) return
  try {
    res.status(202).json(
      await promptFromApi(uid(req), req.params.id, body.text, {
        scene: body.scene ?? null,
        slide: body.slide ?? null,
      }),
    )
  } catch (error) {
    failFromError(res, error, 'POST /v1/projects/:id/prompt')
  }
})

const exportSchema = z.object({ res: z.enum(['720p', '1080p', '4k']).optional() })
router.post('/projects/:id/export', async (req, res) => {
  const body = parseBody(res, exportSchema, req.body ?? {})
  if (!body) return
  try {
    res.status(202).json(await exportFromApi(uid(req), req.params.id, body))
  } catch (error) {
    failFromError(res, error, 'POST /v1/projects/:id/export')
  }
})

router.get('/projects/:id/export', async (req, res) => {
  try {
    res.json(await exportStatusFromApi(uid(req), req.params.id))
  } catch (error) {
    failFromError(res, error, 'GET /v1/projects/:id/export')
  }
})

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
