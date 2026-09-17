/**
 * GET /internal/scale — what the autoscaler follows.
 *
 * GET /internal/scale — the fleet's numbers, for a dashboard or an
 * external scaler. `wanted` is the number of workers it would take to hold
 * what is leased with headroom (workers are fixed on GKE, so it is a
 * reading, not a command); `render.wanted` is the render pods the API is
 * setting itself (renderer/autoscale.ts). Behind the worker token.
 */
import express from 'express'
import { authorizedByWorkerToken } from './auth.js'
import { WORKER_TOKEN } from './config.js'
import { fleetStatus } from './lease.js'

export const router = express.Router()

router.get('/', async (req, res) => {
  if (!WORKER_TOKEN) return res.status(503).json({ error: 'STUDIO_WORKER_TOKEN is not configured' })
  if (!authorizedByWorkerToken(req.headers.authorization))
    return res.status(401).json({ error: 'Unauthorized' })
  try {
    res.json(await fleetStatus())
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) })
  }
})
