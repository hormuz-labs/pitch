/**
 * How a render job's output travels: the files the action wrote, as one tar
 * in the workspace bucket at renders/<jobId>/output.tar, extracted by the
 * worker over its hot copy. Only what changed goes back — a workspace is
 * mostly the uploads that were already there.
 */
import { createReadStream } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { bucket, tarExtract, tarToFile } from '../worker/checkpoint.js'

const logger = createLogger('studio:transfer')

const outputKey = (jobId: string) => `renders/${jobId}/output.tar`

/** Directories the tools write scratch into; never part of an output. */
const SKIP_DIRS = new Set(['.thumbs', 'node_modules'])

/**
 * Workspace-relative paths of files written or created at or after `since`
 * (ms). A pure walk, so the tests can drive it with a temp directory.
 */
export async function changedSince(dir: string, since: number): Promise<string[]> {
  const out: string[] = []
  const walk = async (d: string, rel: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.isSymbolicLink()) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || /^\.[^/]*\.(restore|backup)-/.test(e.name)) continue
        await walk(p, r)
      } else if (e.isFile()) {
        if (e.name === '.studio-checkpoint') continue
        const st = await stat(p).catch(() => null)
        if (st && Math.max(st.mtimeMs, st.ctimeMs) >= since) out.push(r)
      }
    }
  }
  await walk(dir, '')
  return out.sort()
}

/** Ship `files` (workspace-relative) from `dir` to the bucket. Returns the count. */
export async function uploadOutput(jobId: string, dir: string, files: string[]): Promise<number> {
  if (!files.length) return 0
  const temp = await mkdtemp(path.join(tmpdir(), 'pitch-render-output-'))
  const archive = path.join(temp, 'output.tar')
  try {
    const size = await tarToFile(dir, files, archive)
    await bucket().put(outputKey(jobId), createReadStream(archive), 'application/x-tar', size)
    const uploaded = await bucket().head(outputKey(jobId))
    if (uploaded?.size !== size)
      throw new Error(
        `Render output upload is incomplete: expected ${size} bytes, got ${uploaded?.size}`,
      )
    return files.length
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

/** Extract a job's output over `dir`. Returns false when the job produced nothing. */
export async function downloadOutput(jobId: string, dir: string): Promise<boolean> {
  const body = await bucket().get(outputKey(jobId))
  if (!body) return false
  await tarExtract(dir, body as any).catch((err: any) => {
    logger.warn(
      { jobId, dir, err: err?.message ?? String(err) },
      'failed to extract job output archive',
    )
    throw err
  })
  return true
}

export async function discardOutput(jobId: string): Promise<void> {
  await bucket()
    .remove(outputKey(jobId))
    .catch(() => {})
}
