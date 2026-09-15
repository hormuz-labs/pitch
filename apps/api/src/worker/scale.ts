/**
 * GET /internal/scale — what the autoscaler follows.
 *
 * Served by the API role, behind the worker token, so the scaler (KEDA's
 * metrics-api trigger, see infra/gke/autoscaling.yaml) needs no database
 * of its own. `wanted` is the number of workers the fleet should have; the
 * rest is there to read on a dashboard.
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
