/**
 * "Send reward invite" — emails a friend the sender's own persistent referral
 * link, rather than minting a new single-use token. The referral system's own
 * signup/conversion dedup already guards abuse, so this stays a thin mailer.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAffiliateByUserId: vi.fn(),
  userProfile: { findUnique: vi.fn() },
  sendReferralInviteEmail: vi.fn().mockResolvedValue({ id: 'email_1' }),
}))

vi.mock('@saas/db', () => ({
  getAffiliateByUserId: mocks.getAffiliateByUserId,
  prisma: { userProfile: mocks.userProfile },
}))
vi.mock('@saas/email', () => ({ sendReferralInviteEmail: mocks.sendReferralInviteEmail }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/affiliate.js'

const app = express()
app.use(express.json())
app.use('/affiliate', router)

const invite = (email: unknown) => request(app).post('/affiliate/invite').send({ email })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAffiliateByUserId.mockResolvedValue({ code: 'ADA-X7K2', status: 'active' })
  mocks.userProfile.findUnique.mockResolvedValue({ firstName: 'Ada' })
  mocks.sendReferralInviteEmail.mockResolvedValue({ id: 'email_1' })
})

describe('POST /affiliate/invite', () => {
  it('emails the sender referral link to the invited address', async () => {
    const response = await invite('friend@example.com')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ sent: true })
    expect(mocks.sendReferralInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'friend@example.com',
        referralUrl: expect.stringContaining('/r/ADA-X7K2'),
      }),
    )
  })

  it('requires the sender to already be a registered affiliate', async () => {
    mocks.getAffiliateByUserId.mockResolvedValue(null)

    const response = await invite('friend@example.com')

    expect(response.status).toBe(404)
    expect(mocks.sendReferralInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid email address', async () => {
    const response = await invite('not-an-email')

    expect(response.status).toBe(400)
    expect(mocks.sendReferralInviteEmail).not.toHaveBeenCalled()
  })

  it('does not send an inactive referral link', async () => {
    mocks.getAffiliateByUserId.mockResolvedValue({ code: 'ADA-X7K2', status: 'suspended' })

    const response = await invite('friend@example.com')

    expect(response.status).toBe(403)
    expect(mocks.sendReferralInviteEmail).not.toHaveBeenCalled()
  })

  it.each([
    { error: 'RESEND_API_KEY is not configured' },
    { error: 'Provider rejected the sender domain' },
    {},
  ])('does not report success when email submission fails: %j', async result => {
    mocks.sendReferralInviteEmail.mockResolvedValue(result)

    const response = await invite('friend@example.com')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'Could not send the invite email. Please try again later.',
    })
    expect(response.body.sent).toBeUndefined()
  })
})
