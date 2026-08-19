/**
 * Launch-video resolution + narration pricing.
 *
 * Covers the two halves that can silently disagree:
 *   1. `launchVideoCreditCost` — the pure pricing table.
 *   2. The REAL `/launch-video/projects/:name/prompt` route wired to the REAL
 *      `createLaunchVideoJob`, asserting what is actually charged and what is
 *      persisted into the job parameters the worker later reads.
 *
 * The route is mounted rather than reimplemented, so a change to validation,
 * defaulting, or the charge path fails here instead of in production billing.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks (factories must be self-contained) ─────────────────────────────────

let _userId: string | null = 'user_test'
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!_userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return _userId
  },
}))

const deductCredit = vi.fn(() => Promise.resolve())
const addCredits = vi.fn(() => Promise.resolve())
let _balance = 1000

vi.mock('@saas/db', () => ({
  getCreditBalance: vi.fn(() => Promise.resolve(_balance)),
  createJob: vi.fn((data: any) => Promise.resolve({ id: 'job_1', ...data })),
  updateJob: vi.fn(() => Promise.resolve({})),
  deductCredit: (...a: any[]) => deductCredit(...(a as [])),
  addCredits: (...a: any[]) => addCredits(...(a as [])),
  prisma: {
    launchVideoProject: { findUnique: vi.fn(), upsert: vi.fn() },
    // The success path fires a Discord notification off this model.
    userProfile: { findUnique: vi.fn(() => Promise.resolve({ email: 'a@b.c' })) },
  },
}))

// Keep the real pricing helpers; stub only the outbound notification so the
// tests never touch the network.
vi.mock('@saas/shared', async importOriginal => ({
  ...((await importOriginal()) as object),
  sendDiscordMessage: vi.fn(() => Promise.resolve()),
}))

vi.mock('@saas/storage', () => ({}))

vi.mock('../apps/api/src/config.js', () => ({
  videoQueue: { add: vi.fn(() => Promise.resolve()) },
  editQueue: { add: vi.fn() },
  enhanceQueue: { add: vi.fn() },
  connection: { publish: vi.fn(() => Promise.resolve(1)) },
  subscriber: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import {
  DEFAULT_LAUNCH_VIDEO_RESOLUTION,
  LAUNCH_VIDEO_LEGACY_CREDIT_COST,
  LAUNCH_VIDEO_NARRATION_CREDITS,
  LAUNCH_VIDEO_RESOLUTIONS,
  isLaunchVideoResolution,
  launchVideoCreditCost,
} from '@saas/shared'

describe('launchVideoCreditCost', () => {
  it('prices each resolution tier with the narration surcharge', () => {
    expect(launchVideoCreditCost('720p', true)).toBe(6)
    expect(launchVideoCreditCost('1080p', true)).toBe(9)
    expect(launchVideoCreditCost('4k', true)).toBe(13)
  })

  it('drops the surcharge for a music-only film', () => {
    expect(launchVideoCreditCost('720p', false)).toBe(5)
    expect(launchVideoCreditCost('1080p', false)).toBe(8)
    expect(launchVideoCreditCost('4k', false)).toBe(12)
  })

  it('charges the tier price plus exactly the surcharge constant', () => {
    for (const [key, tier] of Object.entries(LAUNCH_VIDEO_RESOLUTIONS)) {
      expect(launchVideoCreditCost(key, true) - launchVideoCreditCost(key, false)).toBe(
        LAUNCH_VIDEO_NARRATION_CREDITS,
      )
      expect(launchVideoCreditCost(key, false)).toBe(tier.credits)
    }
  })

  it('narrates by default when the flag is omitted', () => {
    expect(launchVideoCreditCost('1080p')).toBe(9)
    expect(launchVideoCreditCost()).toBe(
      LAUNCH_VIDEO_RESOLUTIONS[DEFAULT_LAUNCH_VIDEO_RESOLUTION].credits +
        LAUNCH_VIDEO_NARRATION_CREDITS,
    )
  })

  it('falls back to the DEFAULT tier for junk — never the cheapest', () => {
    // A malformed request must not be able to buy 4K at the 720p price.
    const fallback = launchVideoCreditCost('8k', true)
    expect(fallback).toBe(launchVideoCreditCost(DEFAULT_LAUNCH_VIDEO_RESOLUTION, true))
    expect(fallback).toBeGreaterThan(launchVideoCreditCost('720p', true))
  })

  it('recognises only the known tiers', () => {
    expect(isLaunchVideoResolution('720p')).toBe(true)
    expect(isLaunchVideoResolution('4k')).toBe(true)
    expect(isLaunchVideoResolution('8k')).toBe(false)
    expect(isLaunchVideoResolution('')).toBe(false)
    expect(isLaunchVideoResolution(undefined)).toBe(false)
  })
})

describe('POST /launch-video/projects/:name/prompt', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    _userId = 'user_test'
    _balance = 1000
    const { router } = await import('../apps/api/src/routes/launch-video.js')
    app = express()
    app.use(express.json())
    app.use('/launch-video', router)
  })

  const post = (body: any) => request(app).post('/launch-video/projects/demo/prompt').send(body)
  const chargedAmount = () => deductCredit.mock.calls[0]?.[1]
  const jobParams = async () => {
    const db: any = await import('@saas/db')
    return db.createJob.mock.calls[0]?.[0]?.parameters
  }

  it('charges the narrated 1080p price by default', async () => {
    const res = await post({ text: 'a launch film' })
    expect(res.status).toBe(202)
    expect(chargedAmount()).toBe(9)
  })

  it('charges the 4K narrated price when 4k is requested', async () => {
    await post({ text: 'a launch film', resolution: '4k' })
    expect(chargedAmount()).toBe(13)
  })

  it('drops the surcharge when narration is explicitly disabled', async () => {
    await post({ text: 'a launch film', resolution: '720p', narration: false })
    expect(chargedAmount()).toBe(5)
  })

  it('persists resolution and the music-only marker for the worker', async () => {
    await post({ text: 'a launch film', resolution: '4k', narration: false })
    const params = await jobParams()
    expect(params.resolution).toBe('4k')
    expect(params.narration).toBe(false)
  })

  it('omits the narration marker when narrated, keeping it the default', async () => {
    await post({ text: 'a launch film' })
    const params = await jobParams()
    expect(params.resolution).toBe(DEFAULT_LAUNCH_VIDEO_RESOLUTION)
    expect(params.narration).toBeUndefined()
  })

  it('rejects an unknown resolution instead of silently repricing it', async () => {
    const res = await post({ text: 'a launch film', resolution: '8k' })
    expect(res.status).toBe(400)
    expect(deductCredit).not.toHaveBeenCalled()
  })

  it('treats a stringly-typed "false" as narrated — never strips the voiceover', async () => {
    await post({ text: 'a launch film', narration: 'false' })
    expect(chargedAmount()).toBe(9)
  })

  it('blocks the job when the balance cannot cover the chosen tier', async () => {
    _balance = 10 // enough for 1080p narrated (9), not for 4K narrated (13)
    const ok = await post({ text: 'a launch film' })
    expect(ok.status).toBe(202)

    vi.clearAllMocks()
    const denied = await post({ text: 'a launch film', resolution: '4k' })
    expect(denied.status).toBe(402)
    expect(deductCredit).not.toHaveBeenCalled()
  })

  it('still requires text', async () => {
    const res = await post({ resolution: '4k' })
    expect(res.status).toBe(400)
    expect(deductCredit).not.toHaveBeenCalled()
  })
})

describe('failure refunds match what was charged', () => {
  // The worker refunds on failure. Before per-resolution pricing this was a flat
  // constant; leaving it that way would refund 720p music-only jobs too much and
  // 4K narrated jobs too little.
  const refundFor = (params: Record<string, unknown> | null) => {
    if (!params) return LAUNCH_VIDEO_LEGACY_CREDIT_COST
    if (!params.resolution) return LAUNCH_VIDEO_LEGACY_CREDIT_COST
    return launchVideoCreditCost(params.resolution as string, params.narration !== false)
  }

  it('refunds the exact charge for every tier/narration combination', () => {
    for (const key of Object.keys(LAUNCH_VIDEO_RESOLUTIONS)) {
      for (const narrated of [true, false]) {
        const params = { resolution: key, ...(narrated ? {} : { narration: false }) }
        expect(refundFor(params)).toBe(launchVideoCreditCost(key, narrated))
      }
    }
  })

  it('refunds legacy jobs at the old flat rate, not the new default', () => {
    // Jobs created before this feature carry no resolution and were charged 5.
    expect(refundFor({ prompt: 'old job' })).toBe(LAUNCH_VIDEO_LEGACY_CREDIT_COST)
    expect(refundFor({ prompt: 'old job' })).toBeLessThan(launchVideoCreditCost())
  })
})
