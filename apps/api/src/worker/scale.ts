/**
 * GET /internal/scale — what the autoscaler follows.
 *
 * Served by the API role, behind the worker token, so the scalers (KEDA's
 * metrics-api triggers, see infra/gke/autoscaling.yaml) need no database
 * of their own. `wanted` is the number of workers the fleet should have
 * and `render.wanted` the number of render pods; the rest is there to read
 * on a dashboard.
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
