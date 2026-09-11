import { describe, expect, it } from 'vitest'
import {
  discordConnectionIssue,
  isClerkReverificationRequired,
  linkedDiscordAccount,
  resumableDiscordVerificationUrl,
} from '../apps/web/src/solid/account/settings/discord-connection.ts'

describe('Discord connection state', () => {
  it('reads the linked Discord handle from Clerk external accounts', () => {
    const account = linkedDiscordAccount([
      { provider: 'google', username: 'not-discord', providerUserId: '1' },
      { provider: 'discord', username: 'pitchmaker', providerUserId: '99887766' },
    ])

    expect(account).toEqual({ id: '99887766', handle: '@pitchmaker' })
  })

  it('does not report an unfinished Discord OAuth attempt as linked', () => {
    expect(
      linkedDiscordAccount([{ provider: 'oauth_discord', username: null, providerUserId: '' }]),
    ).toBeNull()
  })

  it('resumes only an active Discord OAuth attempt, never an expired one', () => {
    const url = new URL('https://discord.com/oauth2/authorize?state=fresh')
    expect(
      resumableDiscordVerificationUrl([
        {
          provider: 'oauth_discord',
          providerUserId: '',
          verification: { status: 'unverified', externalVerificationRedirectURL: url },
        },
      ]),
    ).toBe(url)
    expect(
      resumableDiscordVerificationUrl([
        {
          provider: 'oauth_discord',
          providerUserId: '',
          verification: { status: 'expired', externalVerificationRedirectURL: url },
        },
      ]),
    ).toBeNull()
  })

  it('explains when the Discord identity belongs to another Pitch account', () => {
    expect(
      discordConnectionIssue([
        {
          provider: 'oauth_discord',
          providerUserId: '',
          verification: {
            status: 'unverified',
            error: { code: 'oauth_identification_claimed' },
          },
        },
      ]),
    ).toBe(
      'This Discord account’s email is already linked to another Pitch account. Sign in to that Pitch account to connect Discord.',
    )
  })

  it('recognizes Clerk additional-verification errors', () => {
    expect(
      isClerkReverificationRequired({
        // ClerkJS can surface this client-side condition as a non-403 API
        // response; the structured message is the stable signal.
        status: 422,
        errors: [
          {
            code: 'session_reverification_required',
            longMessage: 'You need to provide additional verification to perform this operation',
          },
        ],
      }),
    ).toBe(true)

    expect(isClerkReverificationRequired(new Error('Discord is unavailable'))).toBe(false)
  })
})
