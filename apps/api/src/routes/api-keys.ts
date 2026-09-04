import { createHash, randomBytes } from 'node:crypto'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

// ── GET / — list the authenticated user's API keys (never includes hashes) ──
router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    res.json(await db.listApiKeys({ id: userId }))
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list API keys')
    res.status(500).json({ error: error.message })
  }
})

// ── POST / — create a new API key; the plaintext key is returned ONLY here ──
router.post('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }

  try {
    const key = `pk_${randomBytes(24).toString('base64url')}`
    const prefix = key.slice(0, 12)
    const keyHash = createHash('sha256').update(key).digest('hex')
    const apiKey = await db.createApiKey({ userId, name, prefix, keyHash }, { id: userId })
    logger.info({ keyId: apiKey.id, userId, name }, 'API key created')
    res.status(201).json({ ...apiKey, key })
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to create API key')
    res.status(500).json({ error: error.message })
  }
})

// ── DELETE /:id — revoke an API key (soft delete via revokedAt) ─────────────
router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const revoked = await db.revokeApiKey(req.params.id, { id: userId })
    if (!revoked) {
      return res.status(404).json({ error: 'API key not found' })
    }
    logger.info({ keyId: req.params.id, userId }, 'API key revoked')
    res.json(revoked)
  } catch (error: any) {
    logger.error({ err: error, keyId: req.params.id, userId }, 'Failed to revoke API key')
    res.status(500).json({ error: error.message })
  }
})
