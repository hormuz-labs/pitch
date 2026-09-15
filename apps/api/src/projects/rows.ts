/**
 * The Project row: how it is read, parsed and written. Everything here is
 * database and event work only — no disk, no session — so it runs the same
 * on an API replica and on the worker that owns the project.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import type { Output } from '../flows/types.js'
import { publishProjectEvent } from '../studio/events.js'
import { type FlowId, type Workspace, workspaceFor } from '../studio/paths.js'
import { normalizePublishedOutputs, normalizePublishedUrl } from './output-urls.js'
import { replaceLegacyUrlTitle } from './title.js'

const logger = createLogger('studio:projects')

export class InsufficientCreditsError extends Error {
  status = 402
  constructor(public balance: number) {
    super(`Insufficient credits (balance: ${balance})`)
  }
}
export class NotFoundError extends Error {
  status = 404
}

export type ProjectStatus = 'empty' | 'working' | 'ready' | 'failed'

export interface ProjectRow {
  id: string
  userId: string
  flow: FlowId
  name: string
  title: string
  prompt: string
  options: Record<string, any>
  sessionFile: string | null
  creditsCharged: number
  outputs: Output[]
  thumbnailUrl: string | null
  lastError: string | null
  isPublic: boolean
  shareSlug: string | null
  shareViews: number
  /** Where the project was started: "app", "api", or "discord". */
  source: string
  /** Placement (worker/lease.ts); null when nobody holds the project. */
  workerId: string | null
  workerEpoch: number | null
  lastWorkerId: string | null
  /** Checkpoint version in object storage; 0 until the first one lands. */
  workspaceVersion: number
  /** Worker-maintained caches for lists: what is on disk, and whether a turn is running. */
  artifactKind: string | null
  busyAt: string | null
  createdAt: string
  updatedAt: string
}

export function parseRow(r: any): ProjectRow {
  const outputs = safeJson<Output[]>(r.outputs, [])
  return {
    ...r,
    options: safeJson(r.options, {}),
    outputs: normalizePublishedOutputs(outputs),
    thumbnailUrl: r.thumbnailUrl ? normalizePublishedUrl(r.thumbnailUrl) : null,
    workerId: r.workerId ?? null,
    workerEpoch: r.workerEpoch ?? null,
    lastWorkerId: r.lastWorkerId ?? null,
    workspaceVersion: Number(r.workspaceVersion ?? 0),
    artifactKind: r.artifactKind ?? null,
    busyAt: r.busyAt ? new Date(r.busyAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }
}

export async function parseAndUpgradeRow(r: any): Promise<ProjectRow> {
  const p = parseRow(r)
  const title = replaceLegacyUrlTitle(p.title, p.prompt)
  if (title === p.title) return p
  await db.prisma.project
    .updateMany({ where: { id: p.id, title: p.title }, data: { title } })
    .catch(err => logger.warn({ err, projectId: p.id }, 'could not persist improved project title'))
  return { ...p, title }
}

export function safeJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string') return (v as T) ?? fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

export function workspaceOf(p: Pick<ProjectRow, 'flow' | 'userId' | 'name'>): Workspace {
  return workspaceFor(p.flow, p.userId, p.name)
}

/** A user's project, or 404. The authorisation step for every route. */
export async function getRow(userId: string, id: string): Promise<ProjectRow> {
  const r = await db.prisma.project.findFirst({ where: { id, userId } })
  if (!r) throw new NotFoundError('Project not found')
  return parseAndUpgradeRow(r)
}

/** A project by id alone — for the worker, which trusts the lease, not a user. */
export async function rowById(id: string): Promise<ProjectRow> {
  const r = await db.prisma.project.findUnique({ where: { id } })
  if (!r) throw new NotFoundError('Project not found')
  return parseRow(r)
}

/**
 * The project row a workspace belongs to. Flow-agnostic on purpose: a
 * workspace is identified by its owner and its name, and what the agent has
 * been asked to make in it can change from one turn to the next.
 */
export async function projectRowFor(ws: { userId: string; name: string }) {
  return db.prisma.project.findFirst({ where: { userId: ws.userId, name: ws.name } })
}

export async function failProject(p: ProjectRow, error: string, refund: boolean): Promise<void> {
  await db.prisma.project
    .update({ where: { id: p.id }, data: { lastError: error } })
    .catch(() => {})
  if (refund && p.creditsCharged > 0) {
    await db
      .refundProjectUsage(p.userId, p.id)
      .catch(err => logger.warn({ err, projectId: p.id }, 'refund failed'))
  }
  publishProjectEvent(p.id, {
    type: 'project',
    project: await getRow(p.userId, p.id).catch(() => null),
  })
}

/** Record an output published to object storage on the project row. */
export async function addOutput(userId: string, id: string, output: Output): Promise<ProjectRow> {
  const p = await getRow(userId, id)
  const outputs = [
    output,
    ...p.outputs.filter(o => !(o.kind === output.kind && o.res === output.res)),
  ]
  const thumbnailUrl = output.kind === 'thumbnail' ? output.url : p.thumbnailUrl
  const row = await db.prisma.project.update({
    where: { id },
    data: { outputs: JSON.stringify(outputs), thumbnailUrl, lastError: null },
  })
  const updated = parseRow(row)
  publishProjectEvent(id, { type: 'project', project: updated })
  void dispatchProjectWebhooks(updated)
  return updated
}

/** Flows publish outputs themselves; this re-reads the row after a turn as a safety net. */
export async function syncOutputs(userId: string, id: string): Promise<void> {
  const p = await getRow(userId, id)
  publishProjectEvent(id, { type: 'project', project: p })
}

export async function updateProject(
  userId: string,
  id: string,
  data: { title?: string; options?: Record<string, any> },
): Promise<ProjectRow> {
  const p = await getRow(userId, id)
  const row = await db.prisma.project.update({
    where: { id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.options ? { options: JSON.stringify({ ...p.options, ...data.options }) } : {}),
    },
  })
  const updated = parseRow(row)
  publishProjectEvent(id, { type: 'project', project: updated })
  return updated
}

// ── Webhooks (job.completed compatibility) ────────────────────────────────────

async function dispatchProjectWebhooks(p: ProjectRow): Promise<void> {
  try {
    const { enqueueWebhookDeliveries } = await import('../lib/webhooks.js')
    const video = p.outputs.find(o => o.kind === 'video')
    const pdf = p.outputs.find(o => o.kind === 'pdf')
    await enqueueWebhookDeliveries({
      id: p.id,
      userId: p.userId,
      status: 'COMPLETED',
      videoUrl: video?.url ?? null,
      pdfUrl: pdf?.url ?? null,
      thumbnailUrl: p.thumbnailUrl,
      parameters: { jobType: p.flow, projectId: p.id, title: p.title, ...p.options },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })
  } catch (err) {
    logger.warn({ err, projectId: p.id }, 'webhook dispatch failed')
  }
}
