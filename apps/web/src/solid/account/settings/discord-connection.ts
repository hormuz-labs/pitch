export interface ClerkExternalAccountLike {
  provider: string
  providerUserId: string
  username?: string | null
  accountIdentifier?: () => string
  verification?: {
    status?: string | null
    externalVerificationRedirectURL?: URL | null
    error?: { code?: string | null } | null
  } | null
}

const DISCORD_ACCOUNT_CONFLICT =
  'This Discord account’s email is already linked to another Pitch account. Sign in to that Pitch account to connect Discord.'

export function discordConnectionIssue(accounts: ClerkExternalAccountLike[]): string | null {
  const discord = accounts.find(item => ['discord', 'oauth_discord'].includes(item.provider))
  return discord?.verification?.error?.code === 'oauth_identification_claimed'
    ? DISCORD_ACCOUNT_CONFLICT
    : null
}

export function resumableDiscordVerificationUrl(accounts: ClerkExternalAccountLike[]): URL | null {
  const account = accounts.find(
    item =>
      ['discord', 'oauth_discord'].includes(item.provider) &&
      !item.providerUserId.trim() &&
      item.verification?.status === 'unverified' &&
      !item.verification.error,
  )
  return account?.verification?.externalVerificationRedirectURL ?? null
}

interface ClerkErrorLike {
  status?: number
  message?: string
  errors?: Array<{ code?: string; message?: string; longMessage?: string; long_message?: string }>
}

export function isClerkReverificationRequired(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false
  const error = reason as ClerkErrorLike
  const details = [
    error.message,
    ...(error.errors ?? []).flatMap(item => [
      item.code,
      item.message,
      item.longMessage,
      item.long_message,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()

  return details.includes('reverification') || details.includes('additional verification')
}

export function linkedDiscordAccount(
  accounts: ClerkExternalAccountLike[],
): { id: string; handle: string } | null {
  const account = accounts.find(
    item =>
      ['discord', 'oauth_discord'].includes(item.provider) && Boolean(item.providerUserId.trim()),
  )
  if (!account) return null
  const identifier = account.username || account.accountIdentifier?.() || account.providerUserId
  return {
    id: account.providerUserId,
    handle: identifier.startsWith('@') ? identifier : `@${identifier}`,
  }
}
