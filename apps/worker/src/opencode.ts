import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk'
import { createLogger } from '@saas/shared'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

function findNodePath(): string {
  const envNode = process.env.NODE
  if (envNode) return envNode
  // When running under Bun, process.execPath points to Bun, not Node.
  // Try to find Node from known locations.
  const nvmPath = path.join(process.env.HOME || '', '.config/nvm/versions/node/v22.18.0/bin/node')
  return nvmPath
}

function spawnServer(port: number, timeout: number): Promise<{ url: string; close(): void }> {
  return new Promise((resolve, reject) => {
    // Bun's process spawning is incompatible with the opencode binary.
    // Spawn via Node.js as a bridge to work around this.
    const nodePath = findNodePath()
    const bridgeScript = path.resolve(__dirname, 'server-bridge.mjs')
    const env: Record<string, string> = {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: 'google/gemini-3.1-pro-preview' }),
    }
    const proc = spawn(nodePath, [bridgeScript, String(port)], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let resolved = false
    const id = setTimeout(() => {
      if (!resolved) {
        proc.kill()
        reject(new Error(`Timeout waiting for server to start after ${timeout}ms`))
      }
    }, timeout)

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (resolved) return
      output += chunk.toString()
      const lines = output.split('\n')
      for (const line of lines) {
        if (line.startsWith('opencode server listening')) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (!match) {
            clearTimeout(id)
            proc.kill()
            reject(new Error(`Failed to parse server url from output: ${line}`))
            return
          }
          clearTimeout(id)
          resolved = true
          resolve({ url: match[1], close: () => { proc.kill() } })
          return
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    proc.on('exit', (code) => {
      clearTimeout(id)
      if (!resolved) {
        let msg = `Server exited with code ${code}`
        if (output.trim()) msg += `\nServer output: ${output}`
        reject(new Error(msg))
      }
    })

    proc.on('error', (error) => {
      clearTimeout(id)
      reject(error)
    })
  })
}

export async function startServer(
  targetDir: string,
): Promise<{ server: OpencodeServer; client: OpencodeClient }> {
  logger.info({ targetDir }, 'Starting OpenCode server')

  const authHeader = ensureAuthCredentials()

  const { url, close } = await spawnServer(4098, 60000)

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
