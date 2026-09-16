const DISCORD_ID = /^\d{5,25}$/
const DISCORD_API = 'https://discord.com/api/v10'

export class DiscordMembershipError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message)
  }
}

export function discordRewardConfigured(): boolean {
  return Boolean(
    process.env.DISCORD_BOT_TOKEN?.trim() &&
      DISCORD_ID.test(process.env.DISCORD_GUILD_ID?.trim() ?? ''),
  )
}

function botHeaders(): Record<string, string> {
  return { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN!.trim()}` }
}

/**
 * Put the user in the server on their behalf. Works only when the OAuth grant
 * carried `guilds.join`; any other outcome is reported, never thrown, because
 * the caller falls back to asking the user to join by invite.
 */
export async function joinDiscordGuild(
  discordUserId: string,
  accessToken: string,
): Promise<'joined' | 'member' | 'pending' | 'unauthorized' | 'failed'> {
  if (!discordRewardConfigured() || !DISCORD_ID.test(discordUserId)) return 'failed'
  const guildId = process.env.DISCORD_GUILD_ID!.trim()
  try {
    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
      method: 'PUT',
      headers: { ...botHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(8_000),
    })
    if (response.status === 204) return 'member'
    if (response.status === 201) {
      const member = await response.json().catch(() => null)
      return member?.pending === true ? 'pending' : 'joined'
    }
    // 401/403: the token lacks guilds.join, or the bot cannot invite.
    return response.status === 401 || response.status === 403 ? 'unauthorized' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Fetch one member directly: no member-list cache or privileged gateway intent. */
export async function verifyDiscordMembership(discordUserId: string): Promise<string> {
  if (!discordRewardConfigured()) {
    throw new DiscordMembershipError(
      'Discord rewards are not configured yet. Try again later.',
      503,
    )
  }
  if (!DISCORD_ID.test(discordUserId)) {
    throw new DiscordMembershipError(
      'Connect your Discord account before claiming the reward.',
      400,
    )
  }
  const guildId = process.env.DISCORD_GUILD_ID!.trim()
  let response: Response
  try {
    response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
      headers: botHeaders(),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new DiscordMembershipError('Could not check Discord membership. Please try again.', 503)
  }
  const member = await response.json().catch(() => null)
  if (response.status === 404 && member?.code === 10007) {
    throw new DiscordMembershipError('Join the Pitch Discord server to receive your credits.', 403)
  }
  if (response.status === 429) {
    const seconds = Number(member?.retry_after)
    throw new DiscordMembershipError(
      'Discord is busy. Please wait a moment and try again.',
      429,
      Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 5,
    )
  }
  if (!response.ok || member?.user?.id !== discordUserId) {
    throw new DiscordMembershipError('Could not check Discord membership. Please try again.', 503)
  }
  if (member.pending === true) {
    throw new DiscordMembershipError(
      'Accept the server rules in Discord to receive your credits.',
      403,
    )
  }
  return guildId
}
