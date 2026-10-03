import { constants } from 'node:fs'
import { chmod, mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { newestMtime, renderFile, sourceTargets } from '../flows/launch-video/describe.js'
import { readTimeline, sha256File } from '../render/utils/beats.js'
import { fileUrl, slugify } from '../studio/paths.js'
import type { EditableFormat, NativeLayerSidecar } from './editable-formats.js'
import { buildEditablePackage } from './editable-package.js'
import type { ExportStatus } from './export.js'
import type { ProjectRow } from './service.js'
import { workspaceOf } from './service.js'

interface Artifact {
  kind: string
  rel: string
  at: number
}

interface Job extends ExportStatus {
  controller: AbortController
  staging: string | null
}

const jobs = new Map<string, Job>()
let running = 0
const MTIME_TOLERANCE_MS = 0.01
/**
 * A render pod's output reaches the worker through tar, which keeps whole
 * seconds only, so a recorded mtime can trail the restored file by up to 1s.
 */
const TAR_MTIME_SLACK_MS = 1000

interface SourceIdentity {
  sourceBytes?: number
  sourceMtimeMs?: number
  sourceSha256?: string
}

/**
 * Whether a sidecar describes this exact movie. The digest decides when the
 * sidecar has one; older sidecars fall back to size and mtime, with tar's
 * slack. `digest` is shared so one export hashes the movie at most once.
 */
async function describesMovie(
  sidecar: SourceIdentity,
  video: { size: number; mtimeMs: number },
  digest: () => Promise<string>,
): Promise<boolean> {
  if (sidecar.sourceBytes === undefined || sidecar.sourceBytes !== video.size) return false
  if (sidecar.sourceSha256 !== undefined)
    return /^[\da-f]{64}$/.test(sidecar.sourceSha256) && sidecar.sourceSha256 === (await digest())
  return (
    typeof sidecar.sourceMtimeMs === 'number' &&
    Number.isFinite(sidecar.sourceMtimeMs) &&
    Math.abs(sidecar.sourceMtimeMs - video.mtimeMs) < TAR_MTIME_SLACK_MS
  )
}

const publicStatus = (job: Job): ExportStatus => {
  const { controller: _controller, staging: _staging, ...status } = job
  return status
}

export function editableStatus(projectId: string): ExportStatus | null {
  const job = jobs.get(projectId)
  return job ? publicStatus(job) : null
}

export function cancelEditableExport(projectId: string): boolean {
  const job = jobs.get(projectId)
  if (!job?.running) return false
  job.error = 'cancelled'
  job.stage = 'failed'
  job.running = false
  job.finishedAt = Date.now()
  job.controller.abort()
  return true
}

function conflict(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status })
}

async function trustedMarks(video: string, digest: () => Promise<string>) {
  const [timeline, videoStat] = await Promise.all([readTimeline(video), stat(video)])
  if (!timeline || !(await describesMovie(timeline, videoStat, digest))) return undefined
  return timeline.beats.map(beat => ({ start: beat.start, label: beat.text }))
}

async function trustedNativeLayers(
  video: string,
  digest: () => Promise<string>,
): Promise<{
  nativeLayers?: NativeLayerSidecar
  packageWarnings?: string[]
}> {
  const dot = video.lastIndexOf('.')
  const sidecar = `${dot < 0 ? video : video.slice(0, dot)}.layers.json`
  let handle
  try {
    handle = await open(sidecar, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile() || info.size > 5 * 1024 * 1024)
      return {
        packageWarnings: [
          'Native layer metadata is invalid or too large; exported baked fidelity only.',
        ],
      }
    const bytes = await handle.readFile()
    if (bytes.length > 5 * 1024 * 1024)
      return {
        packageWarnings: [
          'Native layer metadata is invalid or too large; exported baked fidelity only.',
        ],
      }
    const parsed = JSON.parse(bytes.toString('utf8')) as NativeLayerSidecar
    const videoStat = await stat(video)
    if (
      parsed?.version !== 1 ||
      typeof parsed.sourceSha256 !== 'string' ||
      !(await describesMovie(parsed, videoStat, digest))
    )
      return {
        packageWarnings: [
          'Native layer metadata does not match the selected movie; exported baked fidelity only.',
        ],
      }
    return { nativeLayers: parsed }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    return { packageWarnings: ['Native layer metadata is invalid; exported baked fidelity only.'] }
  } finally {
    await handle?.close()
  }
}

export async function startEditableExport(
  p: ProjectRow,
  artifact: Artifact | null,
  format: EditableFormat,
  requestedRes: unknown,
  sharedStatus: () => ExportStatus,
): Promise<ExportStatus> {
  const existing = jobs.get(p.id)
  if (existing?.running) return publicStatus(existing)
  if (running >= 1)
    conflict('Too many editable exports are running. Wait for one to finish, then try again.', 429)
  if (!artifact) conflict('Create or render a video first, then export an editable package.')
  if (artifact.kind === 'browser')
    conflict('Stop the current recording and render a video before exporting an editable package.')
  if (artifact.kind === 'deck' || artifact.kind === 'pdf')
    conflict('Render this artifact as a video first, then export an editable package.')
  if (artifact.kind !== 'launch' && artifact.kind !== 'video')
    conflict('Create or render a video first, then export an editable package.')

  const ws = workspaceOf(p)
  const launch = artifact.kind === 'launch'
  let res: string | null = null
  let videoRel = artifact.rel
  if (launch) {
    res = String(requestedRes ?? '1080p')
    if (!['720p', '1080p', '4k'].includes(res))
      throw Object.assign(new Error('unknown resolution'), { status: 400 })
    videoRel = renderFile(res as '720p' | '1080p' | '4k')
    const video = path.join(ws.dir, videoRel)
    const [videoStat, sourcesAt] = await Promise.all([
      stat(video).catch(() => null),
      newestMtime(sourceTargets(ws.dir)),
    ])
    if (
      !videoStat?.isFile() ||
      videoStat.size === 0 ||
      sourcesAt - videoStat.mtimeMs > MTIME_TOLERANCE_MS
    )
      conflict(`Render a current ${res} MP4 first, then export the editable package.`)
  }
  const competing = sharedStatus()
  if (competing.running) return competing

  const filename = `${slugify(p.title || p.name)}-${format}${launch ? `-${res}` : ''}.zip`
  const finalRel = `renders/editable-${format}-${launch ? res : 'source'}.zip`
  const controller = new AbortController()
  const job: Job = {
    format,
    filename,
    running: true,
    res,
    url: null,
    progress: 15,
    stage: 'packaging',
    error: null,
    startedAt: Math.max(Date.now(), (competing.startedAt ?? 0) + 1),
    finishedAt: null,
    controller,
    staging: null,
  }
  jobs.set(p.id, job)
  running++
  void (async () => {
    let slotHeld = true
    const releaseSlot = () => {
      if (!slotHeld) return
      slotHeld = false
      running--
    }
    try {
      await mkdir(path.join(ws.dir, 'renders'), { recursive: true })
      const staging = await mkdtemp(path.join(ws.dir, 'renders', '.editable-'))
      job.staging = staging
      await chmod(staging, 0o700)
      const movie = path.join(ws.dir, videoRel)
      let hashing: Promise<string> | undefined
      const digest = () => {
        hashing ??= sha256File(movie)
        return hashing
      }
      const marks = await trustedMarks(movie, digest)
      const native = launch ? await trustedNativeLayers(movie, digest) : {}
      const result = await buildEditablePackage({
        workspaceDir: ws.dir,
        videoRel,
        outputDir: staging,
        format,
        title: p.title || p.name,
        signal: controller.signal,
        marks,
        ...native,
      })
      controller.signal.throwIfAborted()
      await rename(result.file, path.join(ws.dir, finalRel))
      releaseSlot()
      job.progress = 100
      job.url = fileUrl(ws.internal, finalRel)
      job.stage = 'done'
      job.running = false
      job.finishedAt = Date.now()
    } catch (error) {
      releaseSlot()
      if (job.error !== 'cancelled')
        job.error = error instanceof Error ? error.message : String(error)
      job.stage = 'failed'
      job.running = false
      job.finishedAt = Date.now()
    } finally {
      releaseSlot()
      if (job.staging) await rm(job.staging, { recursive: true, force: true })
      job.staging = null
    }
  })()
  return publicStatus(job)
}
