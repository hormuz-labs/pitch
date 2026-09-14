import { constants } from 'node:fs'
import { chmod, mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { newestMtime, renderFile, sourceTargets } from '../flows/launch-video/describe.js'
import { readTimeline } from '../render/utils/beats.js'
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

async function trustedMarks(video: string) {
  const [timeline, videoStat] = await Promise.all([readTimeline(video), stat(video)])
  if (!timeline) return undefined
  const identityMatches =
    timeline.sourceBytes !== undefined &&
    timeline.sourceMtimeMs !== undefined &&
    timeline.sourceBytes === videoStat.size &&
    Math.abs(timeline.sourceMtimeMs - videoStat.mtimeMs) <= MTIME_TOLERANCE_MS
  if (!identityMatches) return undefined
  return timeline.beats.map(beat => ({ start: beat.start, label: beat.text }))
}

async function trustedNativeLayers(video: string): Promise<{
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
      parsed.sourceBytes !== videoStat.size ||
      !Number.isFinite(parsed.sourceMtimeMs) ||
      Math.abs(parsed.sourceMtimeMs - videoStat.mtimeMs) > MTIME_TOLERANCE_MS ||
      !/^[\da-f]{64}$/.test(parsed.sourceSha256)
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
      const marks = await trustedMarks(path.join(ws.dir, videoRel))
      const native = launch ? await trustedNativeLayers(path.join(ws.dir, videoRel)) : {}
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
