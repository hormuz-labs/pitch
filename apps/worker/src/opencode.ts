import crypto from 'node:crypto'
import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk'
import { createLogger } from '@saas/shared'

const logger = createLogger('worker:opencode')

export interface OpencodeServer {
  url: string
  close(): void
  authHeader: string
}

function ensureAuthCredentials() {
  if (!process.env.OPENCODE_SERVER_PASSWORD) {
    process.env.OPENCODE_SERVER_PASSWORD = crypto.randomBytes(32).toString('hex')
  }
  if (!process.env.OPENCODE_SERVER_USERNAME) {
    process.env.OPENCODE_SERVER_USERNAME = 'opencode'
  }
  return `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`
}


export async function startServer(
  targetDir: string,
): Promise<{ server: OpencodeServer; client: OpencodeClient }> {
  logger.info({ targetDir }, 'Starting OpenCode server')

  const authHeader = ensureAuthCredentials()

  const { url, close } = await createOpencodeServer({
    port: 4098,
    timeout: 60000,
    config: { model: 'google/gemini-3.1-pro-preview' },
  })

  const client = createOpencodeClient({
    baseUrl: url,
    headers: { Authorization: authHeader },
  })
  logger.info({ url }, 'OpenCode server ready')
  return { server: { url, close, authHeader }, client }
}

export async function restartServer(
  server: OpencodeServer,
  targetDir: string,
  maxRetries: number = 3,
): Promise<{ server: OpencodeServer; client: OpencodeClient }> {
  logger.error('Attempting to restart OpenCode server')
  try {
    server.close()
  } catch (e) {
    logger.warn({ err: e }, 'Error closing old OpenCode server')
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ attempt, maxRetries }, 'Restarting OpenCode server')
      return await startServer(targetDir)
    } catch (e) {
      logger.error({ err: e, attempt }, 'OpenCode server restart failed')
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 30000)
        logger.info({ delayMs: delay }, 'Waiting before next restart attempt')
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  throw new Error('OpenCode server restart exhausted all retries')
}

export async function checkServerHealth(
  server: OpencodeServer,
  timeoutMs: number = 5000,
): Promise<boolean> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)
  try {
    const res = await fetch(`${server.url}/path`, {
      signal: abortController.signal,
      headers: { Authorization: server.authHeader },
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    clearTimeout(timeout)
    return false
  }
}

export function getSessionIdFromEvent(event: any): string | undefined {
  const payload = event?.payload ?? event
  const props = payload?.properties
  if (!props) return undefined
  return props.sessionID ?? props.info?.sessionID ?? props.part?.sessionID
}
