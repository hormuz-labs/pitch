import { createLogger } from '@saas/shared'
import express from 'express'
import { listElevenLabsVoices } from '../lib/elevenlabs.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('studio:voices')
export const router = express.Router()

router.get('/', async (req, res) => {
  if (!requireAuth(req, res)) return
  const search = req.query.search ?? ''
  const cursor = req.query.cursor ?? ''
  if (
    typeof search !== 'string' ||
    search.length > 120 ||
    typeof cursor !== 'string' ||
    cursor.length > 500
  ) {
    res.status(400).json({ error: 'Invalid voice search' })
    return
  }
  try {
    res.set('Cache-Control', 'private, no-store').json(await listElevenLabsVoices(search, cursor))
  } catch (err) {
    logger.warn({ err }, 'voice catalog unavailable')
    res.status(424).json({ error: 'Voices are unavailable right now. Please try again shortly.' })
  }
})
