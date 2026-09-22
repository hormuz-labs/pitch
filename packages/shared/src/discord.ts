import { createLogger } from './index.js'

const logger = createLogger('discord')

export interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: DiscordEmbedField[]
  timestamp?: string
  footer?: { text: string; icon_url?: string }
  thumbnail?: { url: string }
}

export interface DiscordMessagePayload {
  content?: string
  embeds?: DiscordEmbed[]
}

export const DISCORD_COLORS = {
  INFO: 0x3b82f6,
  SUCCESS: 0x10b981,
  RENDER: 0x8b5cf6,
  WARNING: 0xf59e0b,
  ERROR: 0xef4444,
} as const

export async function sendDiscordMessage(payload: string | DiscordMessagePayload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    logger.debug('Discord webhook URL missing, skipping notification.')
    return
  }

  try {
    const body = typeof payload === 'string' ? { content: payload } : payload
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      logger.error(
        { status: response.status, body: await response.text() },
        'Failed to send Discord message',
      )
    }
  } catch (error) {
    logger.error({ err: error }, 'Error sending Discord message')
  }
}
