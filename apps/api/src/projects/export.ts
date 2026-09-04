/**
 * Exports. A flow that renders on demand (launch video) runs its renderer
 * here and publishes the result; every other flow publishes whatever its
 * agent already produced. One export per project at a time.
 */
import * as db from '@saas/db'
import { isLaunchVideoResolution, LAUNCH_VIDEO_RESOLUTIONS } from '@saas/shared'
import type { Output } from '../flows/types.js'
import { addOutput, getProject, getRow, type ProjectRow, workspaceOf } from './service.js'

export interface ExportStatus {
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
  ): ExportStatus
  status(projectId: string): ExportStatus
  cancel(projectId: string): boolean
}

const exporters = new Map<string, Exporter>()
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
  for (const e of exporters.values()) {
    const s = e.status(projectId)
    if (s.stage !== 'idle') return s
  }
  return IDLE
}

export function cancelExport(projectId: string): boolean {
  return [...exporters.values()].some(e => e.cancel(projectId))
}

export async function exportProject(
  userId: string,
  id: string,
  body: Record<string, any>,
): Promise<ExportStatus> {
  const p = await getRow(userId, id)
  const exporter = exporters.get(p.flow)
  if (!exporter) {
    // Nothing to render: the latest published output is the export.
    const latest = p.outputs.find(o => o.kind === 'video' || o.kind === 'pdf')
    return {
      ...IDLE,
      stage: latest ? 'done' : 'failed',
      url: latest?.url ?? null,
      error: latest ? null : 'nothing to export yet',
    }
  }
  // Launch video: the paid tier is free; higher tiers charge the difference once.
  if (p.flow === 'launch-video') {
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
  void workspaceOf
  return exporter.start(p, body, o => addOutput(userId, id, o).then(() => undefined))
}
