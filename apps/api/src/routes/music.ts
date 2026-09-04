import express from 'express'
import { listMusic } from '../lib/music.js'
import { requireAuth } from '../middleware/auth.js'

export const router = express.Router()
router.get('/', async (req, res) => {
  if (!requireAuth(req, res)) return
  res.json(await listMusic())
})
