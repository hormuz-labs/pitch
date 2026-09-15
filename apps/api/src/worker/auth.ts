/**
 * The one credential between studio processes: a bearer token equal to
 * STUDIO_WORKER_TOKEN. The worker contract checks it, and so does the
 * autoscaler's read of /internal/scale.
 */
import { timingSafeEqual } from 'node:crypto'
import { WORKER_TOKEN } from './config.js'

export function authorizedByWorkerToken(header: string | undefined): boolean {
  if (!WORKER_TOKEN || !header?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice('Bearer '.length).trim())
  const expected = Buffer.from(WORKER_TOKEN)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
