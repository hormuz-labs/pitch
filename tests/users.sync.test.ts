/**
 * Security regression tests for POST /users/sync in
 * apps/studio/src/routes/users.ts.
 *
 * Pins the fix for the privilege-escalation bug where a body-supplied email
 * was written verbatim to UserProfile.email, letting any user claim an admin
 * address and pass requireAdmin. The route must now ignore body email and use
 * the verified primary email from Clerk.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock requireAuth at the middleware path users.ts imports.
let _userId: string | null = 'user_attacker'
vi.mock('../apps/studio/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!_userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return _userId
  },
}))

// Mock the thin Clerk wrapper so we control the verified profile.
let _verifiedProfile: any = null
vi.mock('../apps/studio/src/lib/clerk.js', () => ({
  getVerifiedClerkProfile: vi.fn(async (_id: string) => {
    if (!_verifiedProfile) throw new Error('No verified profile configured in test')
    return _verifiedProfile
  }),
}))

vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: { findUnique: vi.fn() },
    newsletterSubscriber: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    onboardingSurvey: { findUnique: vi.fn(), create: vi.fn() },
    creditTransaction: { aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 0 } }) },
  },
  upsertUser: vi.fn(),
  addCredits: vi.fn().mockResolvedValue(undefined),
  getAffiliateByCode: vi.fn(),
  recordReferralSignup: vi.fn().mockResolvedValue({ rewarded: true }),
}))

vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  sendDiscordMessage: vi.fn(() => Promise.resolve()),
  JOB_CANCELLATIONS_CHANNEL: 'cancel',
  JOB_UPDATES_CHANNEL: 'updates',
}))

// admin.ts pulls bullmq/redis from config.js — stub them so the router can mount.
vi.mock('../apps/studio/src/config.js', () => ({
  videoQueue: {
    getJobCounts: vi
      .fn()
      .mockResolvedValue({ waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 }),
    getWorkers: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn(),
    resume: vi.fn(),
    getJob: vi.fn().mockResolvedValue(null),
  },
  connection: { publish: vi.fn().mockResolvedValue(1) },
  subscriber: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  // Referral config consumed by users.ts /sync (signup bonus + referral attribution).
  SIGNUP_BONUS_CREDITS: 3,
  REFERRAL_REWARDS: { newUserBonus: 3, referrerSignup: 1, referrerPurchase: 8 },
}))

import * as db from '@saas/db'
import { getVerifiedClerkProfile } from '../apps/studio/src/lib/clerk.js'
import { router as adminRouter } from '../apps/studio/src/routes/admin.js'
import { router as usersRouter } from '../apps/studio/src/routes/users.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/users', usersRouter)
  return app
}

let app: express.Express

beforeEach(() => {
  vi.clearAllMocks()
  _userId = 'user_attacker'
  _verifiedProfile = null
  vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue(null)
  vi.mocked((db as any).prisma.newsletterSubscriber.findFirst).mockResolvedValue(null)
  vi.mocked((db as any).prisma.onboardingSurvey.findUnique).mockResolvedValue(null)
  vi.mocked((db as any).upsertUser).mockImplementation(async (input: any) => input)
  app = buildApp()
})

describe('onboarding survey', () => {
  const validAnswers = {
    creationGoal: 'product-demos',
    role: 'founder',
    teamSize: 'just-me',
    monthlyVolume: '1-2',
    discoverySource: 'google',
  }

  it('is required before completion and is persisted once', async () => {
    const before = await request(app).get('/users/onboarding')
    expect(before.status).toBe(200)
    expect(before.body.completed).toBe(false)

    vi.mocked((db as any).prisma.onboardingSurvey.create).mockResolvedValue({
      id: 'survey_1',
      userId: 'user_attacker',
      ...validAnswers,
    })
    const completed = await request(app).post('/users/onboarding').send(validAnswers)
    expect(completed.status).toBe(201)
    expect(completed.body.completed).toBe(true)
  })

  it('rejects a second response for the same user', async () => {
    vi.mocked((db as any).prisma.onboardingSurvey.findUnique).mockResolvedValue({ id: 'survey_1' })
    const response = await request(app).post('/users/onboarding').send(validAnswers)
    expect(response.status).toBe(409)
  })

  it('rejects values outside the server allowlists', async () => {
    const response = await request(app)
      .post('/users/onboarding')
      .send({ ...validAnswers, role: 'super-admin' })
    expect(response.status).toBe(400)
  })
})

describe('POST /users/sync', () => {
  it('ignores body-supplied email and uses the Clerk-verified primary email', async () => {
    _verifiedProfile = {
      email: 'real-user@example.com',
      firstName: 'Real',
      lastName: 'User',
      imageUrl: 'https://img/real.png',
    }

    const res = await request(app).post('/users/sync').send({
      email: 'admin@trypitch.co', // attacker tries to overwrite
      firstName: 'Spoofed',
      lastName: 'Spoofed',
    })

    expect(res.status).toBe(200)

    // upsertUser must be called with the Clerk-verified email, NOT the body email.
    expect(db.upsertUser).toHaveBeenCalledTimes(1)
    const call = vi.mocked(db.upsertUser).mock.calls[0][0]
    expect(call.email).toBe('real-user@example.com')
    expect(call.email).not.toBe('admin@trypitch.co')
    expect(call.id).toBe('user_attacker')

    // The verified-profile helper must have been invoked with the auth'd user id.
    expect(getVerifiedClerkProfile).toHaveBeenCalledWith('user_attacker')
  })

  it('cannot escalate to admin by passing an admin email in the body', async () => {
    // Body claims an admin address; Clerk says the user's verified email is a non-admin one.
    process.env.ADMIN_EMAILS = 'admin@trypitch.co'
    _verifiedProfile = {
      email: 'attacker@evil.example',
      firstName: 'Mal',
      lastName: 'Lory',
    }

    // Shared in-memory profile store so users.sync writes are visible to admin.findUnique.
    const profileStore = new Map<string, any>()
    vi.mocked((db as any).upsertUser).mockImplementation(async (input: any) => {
      profileStore.set(input.id, { id: input.id, email: input.email })
      return profileStore.get(input.id)
    })
    vi.mocked((db as any).prisma.userProfile.findUnique).mockImplementation(
      async ({ where }: any) => profileStore.get(where.id) ?? null,
    )

    const combined = express()
    combined.use(express.json())
    combined.use('/users', usersRouter)
    combined.use('/admin', adminRouter)

    // 1) Attacker tries to overwrite their stored email with an admin address.
    const sync = await request(combined).post('/users/sync').send({ email: 'admin@trypitch.co' })
    expect(sync.status).toBe(200)

    // The stored email must be the Clerk-verified one, not the body-supplied one.
    expect(profileStore.get('user_attacker').email).toBe('attacker@evil.example')

    // 2) Subsequent admin request must be rejected.
    const admin = await request(combined).get('/admin/dashboard')
    expect(admin.status).toBe(403)
  })
})

/**
 * Referral attribution on /users/sync via the `refCode` body field.
 *
 * Regression coverage for the cross-origin cookie bug: the `aff` httpOnly
 * cookie set by the /r/<CODE> redirect never reaches the API in production
 * (Vercel proxies across origins and strips the Set-Cookie). The web app
 * therefore forwards the captured `?ref=<CODE>` value in the sync body, and
 * the API resolves it back to the affiliate to record the lead + credits.
 */
describe('POST /users/sync — referral attribution via refCode', () => {
  beforeEach(() => {
    _verifiedProfile = {
      email: 'newuser@example.com',
      firstName: 'New',
      lastName: 'User',
    }
    vi.mocked((db as any).getAffiliateByCode).mockReset()
    vi.mocked((db as any).recordReferralSignup).mockReset()
    vi.mocked((db as any).recordReferralSignup).mockResolvedValue({ rewarded: true })
  })

  it('records a referral lead and grants new-user + referrer credits when refCode matches an active affiliate', async () => {
    vi.mocked((db as any).getAffiliateByCode).mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'active',
      code: 'ADNANS-4BA5',
    })

    const res = await request(app).post('/users/sync').send({ refCode: 'adnans-4ba5' }) // case-insensitive on input

    expect(res.status).toBe(200)

    // The code is normalised to uppercase before lookup.
    expect(db.getAffiliateByCode).toHaveBeenCalledWith('ADNANS-4BA5')

    // Lead + credits are recorded against the resolved affiliate.
    expect(db.recordReferralSignup).toHaveBeenCalledTimes(1)
    expect(db.recordReferralSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliateId: 'aff_1',
        newUserId: 'user_attacker',
        newUserReward: 3, // REFERRAL_REWARDS.newUserBonus from the test config mock
        referrerReward: 1, // REFERRAL_REWARDS.referrerSignup
      }),
    )
  })

  it('records nothing when refCode is absent (organic signup)', async () => {
    const res = await request(app).post('/users/sync').send({})
    expect(res.status).toBe(200)
    expect(db.getAffiliateByCode).not.toHaveBeenCalled()
    expect(db.recordReferralSignup).not.toHaveBeenCalled()
  })

  it('records nothing when refCode does not resolve to an active affiliate', async () => {
    vi.mocked((db as any).getAffiliateByCode).mockResolvedValue(null)

    const res = await request(app).post('/users/sync').send({ refCode: 'NOPE-0000' })
    expect(res.status).toBe(200)
    expect(db.getAffiliateByCode).toHaveBeenCalledWith('NOPE-0000')
    expect(db.recordReferralSignup).not.toHaveBeenCalled()
  })

  it('records nothing when the resolved affiliate is suspended', async () => {
    vi.mocked((db as any).getAffiliateByCode).mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'suspended',
      code: 'OLD-0000',
    })

    const res = await request(app).post('/users/sync').send({ refCode: 'OLD-0000' })
    expect(res.status).toBe(200)
    expect(db.recordReferralSignup).not.toHaveBeenCalled()
  })

  it('ignores non-string refCode values (defensive)', async () => {
    const res = await request(app).post('/users/sync').send({ refCode: 12345 })
    expect(res.status).toBe(200)
    expect(db.getAffiliateByCode).not.toHaveBeenCalled()
    expect(db.recordReferralSignup).not.toHaveBeenCalled()
  })

  it('does not block signup when the affiliate lookup throws (never-block-signup invariant)', async () => {
    // Simulate a DB blip on the affiliate table. The route must catch the
    // failure, log it, and still return 200 so the user can sign up — the
    // "Failures must never block signup" contract in users.ts.
    vi.mocked((db as any).getAffiliateByCode).mockRejectedValue(
      new Error('affiliate table unavailable'),
    )

    const res = await request(app).post('/users/sync').send({ refCode: 'ADNANS-4BA5' })

    expect(res.status).toBe(200)
    // The signup bonus is still applied (the addCredits call sits outside
    // the attribution try/catch and ran before the throw).
    expect(db.addCredits).toHaveBeenCalled()
    // No referral is recorded when the lookup itself blew up.
    expect(db.recordReferralSignup).not.toHaveBeenCalled()
  })
})
