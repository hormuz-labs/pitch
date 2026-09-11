import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyDiscordMembership } from '../apps/api/src/lib/discord-membership.js'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubEnv('DISCORD_BOT_TOKEN', 'test-bot-token')
  vi.stubEnv('DISCORD_GUILD_ID', '12345678')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Discord membership verification', () => {
  it('verifies the exact member in the configured community guild', async () => {
    fetchMock.mockResolvedValue(Response.json({ user: { id: '99887766' }, pending: false }))
    expect(await verifyDiscordMembership('99887766')).toBe('12345678')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/guilds/12345678/members/99887766',
      {
        headers: { Authorization: 'Bot test-bot-token' },
        signal: expect.any(AbortSignal),
      },
    )
  })

  it('requires server rules screening to be complete', async () => {
    fetchMock.mockResolvedValue(Response.json({ user: { id: '99887766' }, pending: true }))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/rules/),
    })
  })

  it('distinguishes a non-member from an invalid guild or inaccessible bot', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 10007 }, { status: 404 }))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({ status: 403 })
    fetchMock.mockResolvedValueOnce(Response.json({ code: 10004 }, { status: 404 }))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({ status: 503 })
  })

  it.each([401, 403, 500])('fails closed on Discord HTTP %s', async status => {
    fetchMock.mockResolvedValue(Response.json({}, { status }))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({ status: 503 })
  })

  it('honors a Discord rate limit without granting or blindly retrying', async () => {
    fetchMock.mockResolvedValue(Response.json({ retry_after: 2.5 }, { status: 429 }))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({
      status: 429,
      retryAfter: 3,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects malformed successful responses and another member’s identity', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not JSON'))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({ status: 503 })
    fetchMock.mockResolvedValueOnce(Response.json({ user: { id: 'someone-else' } }))
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({ status: 503 })
  })

  it('handles network failures without exposing credentials', async () => {
    fetchMock.mockRejectedValue(new Error('secret internals'))
    await expect(verifyDiscordMembership('99887766')).rejects.toThrow(
      'Could not check Discord membership',
    )
  })

  it('requires server configuration before contacting Discord', async () => {
    vi.stubEnv('DISCORD_GUILD_ID', '')
    await expect(verifyDiscordMembership('99887766')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
