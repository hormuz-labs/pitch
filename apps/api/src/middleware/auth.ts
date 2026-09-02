import { createHash } from 'node:crypto'
import { getAuth } from '@clerk/express'
import { findApiKeyByHash, touchApiKey } from '@saas/db'
import { createLogger } from '@saas/shared'
import type express from 'express'

const logger = createLogger('api')

export const requireAuth = (req: express.Request, res: express.Response) => {
  const auth = getAuth(req)
  if (!auth.userId) {
    let reason = 'Token missing, expired, or invalid'
    const debug = typeof (auth as any).debug === 'function' ? (auth as any).debug() : {}
    if (debug?.message) {
      reason = debug.message
    } else if (auth.sessionStatus) {
      reason = `Session status: ${auth.sessionStatus}`
    }

    logger.error(
      { auth: { ...auth, getToken: undefined }, debug, path: req.path },
      `401 Unauthorized: ${reason}`,
    )

    res.status(401).json({ error: 'Unauthorized', reason, debug })
    return null
  }
  return auth.userId
}

/**
 * Resolve an API key to its owner without touching the response. Accepts
 * `Authorization: Bearer <key>` (preferred) or the `x-api-key` header. Returns
 * null when the key is missing, unknown, or revoked, and bumps lastUsedAt
 * (fire-and-forget) when it is good.
 *
 * Callers own the 401, because /mcp and /v1 answer in different shapes.
 */
export const resolveApiKey = async (req: express.Request): Promise<string | null> => {
  const bearer = req.headers.authorization
  const headerKey = req.headers['x-api-key']
  const key = bearer?.startsWith('Bearer ')
    ? bearer.slice('Bearer '.length).trim()
    : Array.isArray(headerKey)
      ? headerKey[0]
      : headerKey
  if (!key) return null

  const keyHash = createHash('sha256').update(key).digest('hex')
  const apiKey = await findApiKeyByHash(keyHash)
  if (!apiKey || apiKey.revokedAt) return null

  touchApiKey(apiKey.id).catch(err =>
    logger.error({ err, keyId: apiKey.id }, 'Failed to update API key lastUsedAt'),
  )
  return apiKey.userId
}

/** API-key auth for MCP. Sends the flat 401 that MCP clients already expect. */
export const requireApiKey = async (
  req: express.Request,
  res: express.Response,
): Promise<string | null> => {
  const userId = await resolveApiKey(req)
  if (!userId) {
    res.status(401).json({ error: 'Invalid or revoked API key' })
    return null
  }
  return userId
}
