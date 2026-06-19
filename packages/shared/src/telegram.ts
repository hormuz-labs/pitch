import { createLogger } from './index.js'

const logger = createLogger('telegram')

export async function sendTelegramMessage(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    logger.debug('Bot token or chat ID missing, skipping notification.')
    return
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })

    if (!response.ok) {
      logger.error(
        { status: response.status, body: await response.text() },
        'Failed to send Telegram message',
      )
    }
  } catch (error) {
    logger.error({ err: error }, 'Error sending Telegram message')
  }
}
