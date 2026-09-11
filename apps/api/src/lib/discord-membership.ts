const DISCORD_ID = /^\d{5,25}$/

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
    response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`,
      {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN!.trim()}` },
        signal: AbortSignal.timeout(8_000),
      },
    )
  } catch {
    throw new DiscordMembershipError('Could not check Discord membership. Please try again.', 503)
  }
  const member = await response.json().catch(() => null)
  if (response.status === 404 && member?.code === 10007) {
    throw new DiscordMembershipError('Join the Pitch Discord server, then claim your credits.', 403)
  }
  if (response.status === 429) {
    const seconds = Number(member?.retry_after)
    throw new DiscordMembershipError(
      'Discord is busy. Please wait a moment and try claiming again.',
      429,
      Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 5,
    )
  }
  if (!response.ok || member?.user?.id !== discordUserId) {
    throw new DiscordMembershipError('Could not check Discord membership. Please try again.', 503)
  }
  if (member.pending === true) {
    throw new DiscordMembershipError(
      'Accept the server rules in Discord, then claim your credits.',
      403,
    )
  }
  return guildId
}
