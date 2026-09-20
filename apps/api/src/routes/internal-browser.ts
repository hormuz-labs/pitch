import { Router } from 'express'
import { closeOwnedSession, startOwnedSession } from '../services/browser-host.js'

export const internalBrowserRouter = Router()

internalBrowserRouter.use((req, res, next) => {
  const expected = process.env.STUDIO_WORKER_TOKEN
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(403).end()
  next()
})

internalBrowserRouter.post('/sessions/:id/close', async (req, res) => {
  try {
    res.json({ origins: await closeOwnedSession(req.params.id) })
  } catch (err) {
    res.status(404).json({ error: (err as Error).message })
  }
})

internalBrowserRouter.post('/sessions', async (req, res) => {
  const controller = new AbortController()
  req.once('aborted', () => controller.abort())
  try {
    res.status(201).json(await startOwnedSession({ ...req.body, signal: controller.signal }))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
