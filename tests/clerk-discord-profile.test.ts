import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@clerk/express', () => ({ clerkClient: { users: { getUser } } }))

import { getVerifiedClerkProfile } from '../apps/api/src/lib/clerk.js'

const clerkUser = (externalAccounts: Array<{ provider: string; providerUserId: string }>) => ({
  primaryEmailAddressId: 'email_1',
  emailAddresses: [{ id: 'email_1', emailAddress: 'creator@example.com' }],
  firstName: 'Pitch',
  lastName: 'Creator',
  imageUrl: 'https://img.example/avatar.png',
  externalAccounts,
})

describe('verified Clerk profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns Discord providerUserId for the profile mirror', async () => {
    getUser.mockResolvedValue(clerkUser([{ provider: 'discord', providerUserId: '99887766' }]))

    await expect(getVerifiedClerkProfile('user_123')).resolves.toMatchObject({
      email: 'creator@example.com',
      discordUserId: '99887766',
    })
  })

  it('returns null after Discord has been unlinked so sync clears the mirror', async () => {
    getUser.mockResolvedValue(clerkUser([]))

    await expect(getVerifiedClerkProfile('user_123')).resolves.toMatchObject({
      discordUserId: null,
    })
  })
})
