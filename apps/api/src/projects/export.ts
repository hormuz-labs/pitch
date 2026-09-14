/**
 * Exports. A flow that renders on demand (launch video) runs its renderer
 * here and publishes the result; every other flow publishes whatever its
 * agent already produced. One export per project at a time.
 */
import * as db from '@saas/db'
import { isLaunchVideoResolution, LAUNCH_VIDEO_RESOLUTIONS } from '@saas/shared'
import { activeArtifact } from '../agent/describe.js'
import type { Output } from '../flows/types.js'
import { cancelEditableExport, editableStatus, startEditableExport } from './editable-export.js'
import type { EditableFormat } from './editable-formats.js'
import { addOutput, getProject, getRow, type ProjectRow, workspaceOf } from './service.js'

/**
 * Which exporter renders this project. Keyed by what the workspace holds,
 * not by the flow column: new projects are all flow "studio", and one that
 * holds shots.js + index.html is a launch film whatever its row says. Only
 * the launch film renders on demand; everything else exports what its agent
 * already published.
 */
interface Artifact {
  kind: string
  rel: string
  at: number
}

function exporterFor(p: ProjectRow, artifact: Artifact | null): Exporter | undefined {
  if (artifact?.kind === 'launch') return exporters.get('launch-video')
  if (artifact?.kind === 'browser') return undefined
  return exporters.get(p.flow)
}

export interface ExportStatus {
  format?: string
  filename?: string
  running: boolean
  res: string | null
  url: string | null
  progress: number
  /** idle | starting | mixing | capturing | encoding | muxing | uploading | done | failed */
  stage: string
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}

export interface Exporter {
  start(
    p: ProjectRow,
    opts: Record<string, any>,
    publish: (o: Output) => Promise<void>,
  ): ExportStatus | Promise<ExportStatus>
  status(projectId: string): ExportStatus
  cancel(projectId: string): boolean
}

const exporters = new Map<string, Exporter>()
const starting = new Map<string, Promise<ExportStatus>>()
const directJobs = new Map<string, ExportStatus>()
export function registerExporter(flow: string, e: Exporter): void {
  exporters.set(flow, e)
}

const IDLE: ExportStatus = {
  running: false,
  res: null,
  url: null,
  progress: 0,
  stage: 'idle',
  error: null,
  startedAt: null,
  finishedAt: null,
}

export function getExport(projectId: string): ExportStatus {
  const editable = editableStatus(projectId)
  const found: ExportStatus[] = editable ? [editable] : []
  const direct = directJobs.get(projectId)
  if (direct) found.push(direct)
  for (const e of exporters.values()) {
    const s = e.status(projectId)
    if (s.stage !== 'idle') found.push(s)
  }
  return found.reduce<ExportStatus>(
    (latest, status) => ((status.startedAt ?? 0) >= (latest.startedAt ?? 0) ? status : latest),
    IDLE,
  )
}

export function cancelExport(projectId: string): boolean {
  return cancelEditableExport(projectId) || [...exporters.values()].some(e => e.cancel(projectId))
}

export async function exportProject(
  userId: string,
  id: string,
  body: Record<string, any>,
): Promise<ExportStatus> {
  const p = await getRow(userId, id)
  const pending = starting.get(p.id)
  if (pending) return pending
  const start = startProjectExport(userId, id, p, body)
  starting.set(p.id, start)
  try {
    return await start
  } finally {
    if (starting.get(p.id) === start) starting.delete(p.id)
  }
}

async function startProjectExport(
  userId: string,
  id: string,
  p: ProjectRow,
  body: Record<string, any>,
): Promise<ExportStatus> {
  if (body.format && !['mp4', 'premiere', 'after-effects', 'blender'].includes(body.format))
    throw Object.assign(new Error('unknown export format'), { status: 400 })
  const existing = getExport(p.id)
  if (existing.running) return existing
  const artifact = await activeArtifact(workspaceOf(p))
  if (body.format && body.format !== 'mp4') {
    const current = getExport(p.id)
    if (current.running) return current
    return startEditableExport(p, artifact, body.format as EditableFormat, body.res, () =>
      getExport(p.id),
    )
  }
  const exporter = exporterFor(p, artifact)
  if (!exporter) {
    // Nothing to render: the latest published output is the export.
    const latest = p.outputs.find(o => o.kind === 'video' || o.kind === 'pdf')
    const now = Math.max(Date.now(), (getExport(p.id).startedAt ?? 0) + 1)
    const status: ExportStatus = {
      ...IDLE,
      stage: latest ? 'done' : 'failed',
      url: latest?.url ?? null,
      progress: latest ? 100 : 0,
      error: latest ? null : 'nothing to export yet',
      startedAt: now,
      finishedAt: now,
    }
    directJobs.set(p.id, status)
    return status
  }
  // Launch video: the paid tier is free; higher tiers charge the difference once.
  if (exporter === exporters.get('launch-video')) {
    const wanted = String(body.res ?? '1080p')
    if (!isLaunchVideoResolution(wanted))
      throw Object.assign(new Error('unknown resolution'), { status: 400 })
    const paid = isLaunchVideoResolution(p.options.resolution) ? p.options.resolution : '1080p'
    const upgrade =
      LAUNCH_VIDEO_RESOLUTIONS[wanted].credits - LAUNCH_VIDEO_RESOLUTIONS[paid].credits
    if (upgrade > 0) {
      const balance = await db.getCreditBalance(userId)
      if (balance < upgrade)
        throw Object.assign(new Error('Insufficient credits'), { status: 402, balance })
      await db.deductCredit(userId, upgrade, `Launch video export upgrade (${paid} → ${wanted})`, {
        projectId: p.id,
        channel: p.source === 'api' ? 'api' : 'product',
      })
      await db.prisma.project.update({
        where: { id: p.id },
        data: { options: JSON.stringify({ ...p.options, resolution: wanted }) },
      })
    }
    body = { ...body, res: wanted }
  }
  const detail = await getProject(userId, id)
  if (!detail.description.preview)
    throw Object.assign(new Error('nothing to export yet'), { status: 409 })
  const current = getExport(p.id)
  if (current.running) return current
  return await exporter.start(p, body, o => addOutput(userId, id, o).then(() => undefined))
}
