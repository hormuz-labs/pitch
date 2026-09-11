import { timingSafeEqual } from 'node:crypto'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import * as projects from '../projects/service.js'

const logger = createLogger('studio:discord-api')

export const router = Router()
const DISCORD_ID = /^\d{5,25}$/

function authorized(header: string | undefined): boolean {
  const configured = process.env.DISCORD_SERVICE_TOKEN
  if (!configured || !header?.startsWith('Bearer ')) return false
  const supplied = header.slice('Bearer '.length).trim()
  const expectedBuffer = Buffer.from(configured)
  const suppliedBuffer = Buffer.from(supplied)
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  )
}

async function pitchUserId(discordUserId: string): Promise<string | null> {
  const profile = await db.prisma.userProfile.findUnique({
    where: { discordUserId },
    select: { id: true },
  })
  return profile?.id ?? null
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

router.use((req, res, next) => {
  if (!process.env.DISCORD_SERVICE_TOKEN) {
    return res.status(503).json({ error: 'Discord service is not configured' })
  }
  if (!authorized(req.headers.authorization)) {
    return res.status(401).json({ error: 'Invalid service credential' })
  }
  next()
})

router.post('/projects', async (req, res) => {
  const discordUserId = String(req.body?.discordUserId ?? '').trim()
  const prompt = String(req.body?.prompt ?? '').trim()
  if (!DISCORD_ID.test(discordUserId)) {
    return res.status(400).json({ error: 'A valid Discord user id is required' })
  }
  if (!prompt) return res.status(400).json({ error: 'prompt is required' })

  // Discord is a sponsored surface, so it must never inherit a potentially
  // expensive model selected for the main product. Require an explicit model
  // spec and fail before granting a daily credit slot when it is unavailable.
  const model = process.env.DISCORD_STUDIO_MODEL?.trim()
  if (!model?.includes('/') || /\s/.test(model)) {
    return res.status(503).json({ error: 'Discord model is not configured' })
  }

  try {
    const userId = await pitchUserId(discordUserId)
    if (!userId) return res.status(404).json({ error: 'Discord account is not linked' })

    const dailyVideoLimit = nonNegativeInteger(process.env.DISCORD_DAILY_VIDEO_LIMIT, 3)
    const creditsPerVideo = nonNegativeInteger(process.env.DISCORD_FREE_VIDEO_CREDITS, 120)
    const reward = await db.grantDiscordVideoReward(userId, creditsPerVideo, {
      dailyLimit: dailyVideoLimit,
    })
    if (!reward.granted) {
      return res.status(429).json({
        error: `${dailyVideoLimit} Discord videos per day allowed; resets at 00:00 UTC`,
      })
    }
    const project = await projects.createProject(userId, {
      prompt,
      source: 'discord',
      model,
    })
    res.status(202).json({ project, reward })
  } catch (error: any) {
    const status = error?.status ?? 500
    if (status >= 500)
      logger.error({ err: error, discordUserId }, 'Discord project creation failed')
    res.status(status).json({ error: error?.message ?? 'Could not create project' })
  }
})

router.get('/projects/:id', async (req, res) => {
  const discordUserId = String(req.query.discordUserId ?? '').trim()
  if (!DISCORD_ID.test(discordUserId)) {
    return res.status(400).json({ error: 'A valid Discord user id is required' })
  }

  try {
    const userId = await pitchUserId(discordUserId)
    if (!userId) return res.status(404).json({ error: 'Discord account is not linked' })
    res.json({ project: await projects.getProject(userId, req.params.id) })
  } catch (error: any) {
    const status = error?.status ?? 500
    if (status >= 500) logger.error({ err: error, discordUserId }, 'Discord project lookup failed')
    res.status(status).json({ error: error?.message ?? 'Could not read project' })
  }
})
