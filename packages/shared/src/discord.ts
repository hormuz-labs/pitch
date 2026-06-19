import { createLogger } from './index.js'

const logger = createLogger('discord')

export async function sendDiscordMessage(text: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    logger.debug('Discord webhook URL missing, skipping notification.')
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: text,
      }),
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
