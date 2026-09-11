import { clerkClient } from '@clerk/express'

export type VerifiedClerkProfile = {
  email: string
  firstName?: string
  lastName?: string
  imageUrl?: string
  discordUserId: string | null
}

/**
 * Fetch a Clerk user's VERIFIED primary email along with profile fields.
 * Throws if the user has no primary email on file.
 *
 * Isolated behind this thin wrapper so callers don't trust client-supplied
 * email values and so tests can mock the lookup by file path (vi.mock of the
 * `@clerk/express` package specifier is unreliable under bun's workspace
 * symlink layout).
 */
export async function getVerifiedClerkProfile(userId: string): Promise<VerifiedClerkProfile> {
  const user = await clerkClient.users.getUser(userId)
  const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)
  if (!primary?.emailAddress) {
    throw new Error('Clerk user has no primary email')
  }
  return {
    email: primary.emailAddress,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    imageUrl: user.imageUrl ?? undefined,
    discordUserId:
      user.externalAccounts.find(
        account =>
          ['discord', 'oauth_discord'].includes(account.provider) &&
          account.verification?.status === 'verified',
      )?.providerUserId ?? null,
  }
}
