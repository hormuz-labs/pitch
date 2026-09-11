import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'

/** Check real writes, including disk-full/read-only failures, without touching user files. */
export async function checkWritableDirectory(dir: string): Promise<void> {
  const probe = await mkdtemp(path.join(dir, '.health-'))
  try {
    await writeFile(path.join(probe, 'probe'), 'ok')
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
}

export function healthRouter(opts: {
  check: () => Promise<unknown>
  isDraining: () => boolean
  timeoutMs?: number
}) {
  const router = Router()
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  // Liveness must not restart the process just because PostgreSQL is unavailable.
  router.get(['/live', '/'], (_req, res) => res.json({ status: 'ok' }))
  router.get('/ready', async (_req, res) => {
    if (opts.isDraining()) return res.status(503).json({ status: 'draining' })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        opts.check(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Readiness timed out')), opts.timeoutMs ?? 2000)
        }),
      ])
      if (opts.isDraining()) return res.status(503).json({ status: 'draining' })
      res.json({ status: 'ready' })
    } catch {
      // Dependency errors can contain credentials or filesystem paths.
      res.status(503).json({ status: 'unavailable' })
    } finally {
      clearTimeout(timer)
    }
  })
  return router
}
