/**
 * Projects: the unit of the studio. Creating one charges credits, seeds the
 * workspace and starts the first agent turn; every later prompt is free.
 * Status is derived (session busy + what the flow finds in the workspace);
 * outputs published to object storage are recorded on the row.
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import * as db from '@saas/db'
import { createLogger, sendDiscordMessage } from '@saas/shared'
import { getAgent } from '../flows/index.js'
import type { Description, Output, UploadRef } from '../flows/types.js'
import { emitProjectEvent, onProjectEvent, type StudioEvent } from '../studio/events.js'
import {
  type FlowId,
  isValidProjectName,
  PROJECTS_DIR,
  slugify,
  type Workspace,
  workspaceFor,
} from '../studio/paths.js'
import {
  closeSession,
  type Entry,
  listBusy,
  peekSession,
  promptSession,
  stopSession,
  takeModelCost,
} from '../studio/session.js'
import { normalizeCreationOptions } from './creation-options.js'
import { normalizePublishedOutputs, normalizePublishedUrl } from './output-urls.js'
import { projectTitle, replaceLegacyUrlTitle } from './title.js'
import { chargeTurn, MIN_BALANCE } from './usage.js'

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
  createdAt: string
  updatedAt: string
}

export interface ProjectInfo extends ProjectRow {
  status: ProjectStatus
  busy: boolean
}

export interface ProjectDetail extends ProjectInfo {
  description: Description
}

function parseRow(r: any): ProjectRow {
  const outputs = safeJson<Output[]>(r.outputs, [])
  return {
    ...r,
    options: safeJson(r.options, {}),
    outputs: normalizePublishedOutputs(outputs),
    thumbnailUrl: r.thumbnailUrl ? normalizePublishedUrl(r.thumbnailUrl) : null,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }
}

async function parseAndUpgradeRow(r: any): Promise<ProjectRow> {
  const p = parseRow(r)
  const title = replaceLegacyUrlTitle(p.title, p.prompt)
  if (title === p.title) return p
  await db.prisma.project
    .updateMany({ where: { id: p.id, title: p.title }, data: { title } })
    .catch(err => logger.warn({ err, projectId: p.id }, 'could not persist improved project title'))
  return { ...p, title }
}

function safeJson<T>(v: unknown, fallback: T): T {
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

function statusOf(
  p: ProjectRow,
  busy: boolean,
  desc: Description | null,
  /** Cheap filesystem answer, for lists that do not describe every project. */
  artifact = false,
): ProjectStatus {
  if (busy) return 'working'
  const hasSomething =
    Boolean(desc?.preview) || artifact || p.outputs.length > 0 || (desc?.outputs.length ?? 0) > 0
  if (hasSomething) return 'ready'
  return p.lastError ? 'failed' : 'empty'
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getRow(userId: string, id: string): Promise<ProjectRow> {
  const r = await db.prisma.project.findFirst({ where: { id, userId } })
  if (!r) throw new NotFoundError('Project not found')
  return parseAndUpgradeRow(r)
}

export async function listProjects(userId: string, flow?: FlowId): Promise<ProjectInfo[]> {
  const rows = await db.prisma.project.findMany({
    where: { userId, ...(flow ? { flow } : {}) },
    orderBy: { createdAt: 'desc' },
  })
  const busy = listBusy()
  const agent = getAgent()
  // A project opened from a drop has a preview and no output yet, so the row
  // alone cannot tell whether it is empty. Ask the filesystem, cheaply.
  return Promise.all(
    rows.map(async r => {
      const p = await parseAndUpgradeRow(r)
      const artifact = await agent.hasArtifact(workspaceOf(p)).catch(() => false)
      return { ...p, busy: busy.has(p.id), status: statusOf(p, busy.has(p.id), null, artifact) }
    }),
  )
}

export async function describeProject(p: ProjectRow): Promise<Description> {
  const agent = getAgent()
  const ws = workspaceOf(p)
  if (!existsSync(ws.dir)) return { preview: null, outputs: [] }
  try {
    return await agent.describe(ws)
  } catch (err: any) {
    logger.warn({ err, projectId: p.id }, 'describe failed')
    return { preview: null, outputs: [], error: err.message }
  }
}

export async function getProject(userId: string, id: string): Promise<ProjectDetail> {
  const p = await getRow(userId, id)
  const description = await describeProject(p)
  const busy = peekSession(p.id)?.busy ?? false
  return { ...p, busy, status: statusOf(p, busy, description), description }
}

export function getEntries(projectId: string): Entry[] {
  return peekSession(projectId)?.entries ?? []
}

// ── Writes ────────────────────────────────────────────────────────────────────

async function uniqueName(userId: string, flow: FlowId, base: string): Promise<string> {
  const taken = new Set(
    (await db.prisma.project.findMany({ where: { userId, flow }, select: { name: true } })).map(
      r => r.name,
    ),
  )
  if (!taken.has(base) && !existsSync(workspaceFor(flow, userId, base).dir)) return base
  for (let i = 2; ; i++) {
    const n = `${base}-${i}`
    if (!taken.has(n) && !existsSync(workspaceFor(flow, userId, n).dir)) return n
  }
}

export interface CreateProjectInput {
  prompt: string
  options?: Record<string, any>
  uploads?: UploadRef[]
  name?: string
  /** A `provider/id` model spec from the composer picker; kept in options. */
  model?: string
  /** Where this project was started. Defaults to "app". */
  source?: string
}

/**
 * Create a project: record it, seed the workspace, and send the first prompt
 * when there is one.
 *
 * Dropping a file with nothing to say is a normal way to start — you want to
 * look at it in the editor and decide there — so an empty prompt opens the
 * project without running a turn. The upload is already the preview, and
 * nothing is billed until the user actually asks for something.
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectDetail> {
  const agent = getAgent()
  const prompt = String(input.prompt ?? '').trim()
  if (!prompt && !input.uploads?.length)
    throw Object.assign(new Error('prompt is required'), { status: 400 })
  const options = normalizeCreationOptions(input.options)
  const model =
    typeof input.model === 'string' && input.model.includes('/') ? input.model : undefined
  if (model) options.model = model
  const uploads = input.uploads ?? []
  if (Array.isArray(options.referenceVideoFiles)) {
    const uploadedPaths = new Map(
      uploads.map(upload => {
        const originalName = path.basename(upload.name)
        const workspaceName = originalName.replace(/[^\w.-]+/g, '_') || 'upload'
        return [originalName, `uploads/${workspaceName}`]
      }),
    )
    options.referenceVideoFiles = options.referenceVideoFiles.flatMap(name => {
      const workspacePath = uploadedPaths.get(name)
      return workspacePath ? [workspacePath] : []
    })
  }

  // Nothing is charged for opening a project: the studio bills what the work
  // actually costs, turn by turn (projects/usage.ts). The balance check is
  // only that they can pay for some of it.
  const balance = await db.getCreditBalance(userId)
  if (balance < MIN_BALANCE) throw new InsufficientCreditsError(balance)

  const title = projectTitle(
    prompt,
    uploads.map(upload => upload.name),
  )
  const wanted = input.name && isValidProjectName(input.name) ? input.name : slugify(title)
  const name = await uniqueName(userId, 'studio', wanted)

  const row = await db.prisma.project.create({
    data: {
      userId,
      flow: 'studio',
      name,
      title,
      prompt,
      options: JSON.stringify(options),
      source: input.source ?? 'app',
    },
  })
  const p = parseRow(row)

  const ws = workspaceOf(p)
  try {
    await agent.prepare(ws, options, uploads)
    if (prompt) await promptProject(p, prompt, { first: true, uploads })
  } catch (err: any) {
    logger.error({ err, projectId: p.id }, 'could not open the project')
    await failProject(p, `Could not start: ${err.message}`, false)
    throw err
  }

  db.prisma.userProfile
    .findUnique({ where: { id: userId } })
    .then(u =>
      sendDiscordMessage(
        `🎬 **New project**\nProject: \`${p.id}\`\nUser: ${u?.email || userId}\nTitle: ${title}\nPrompt: *${prompt.slice(0, 300) || '(opened from an upload)'}*`,
      ),
    )
    .catch(() => {})

  return getProject(userId, p.id)
}

interface PromptOptions {
  first?: boolean
  targets?: Array<Record<string, any>>
  scene?: string | null
  slide?: number | null
  uploads?: UploadRef[]
  /** Extra per-turn option overrides (e.g. a newly picked music bed). */
  options?: Record<string, any>
  /** This turn's model pick; overrides the one stored in the project's options. */
  model?: string
}

export async function promptProject(
  p: ProjectRow,
  text: string,
  opts: PromptOptions = {},
): Promise<void> {
  const agent = getAgent()
  const ws = workspaceOf(p)
  const first = opts.first ?? false
  if (opts.uploads?.length && !first)
    await agent.prepare(ws, { ...p.options, ...opts.options }, opts.uploads)
  const context = await agent.context(ws, {
    first,
    options: { ...p.options, ...(opts.options ?? {}) },
    targets: opts.targets,
    scene: opts.scene ?? null,
    slide: opts.slide ?? null,
  })
  // This turn's pick wins; otherwise the project keeps running on the model
  // it was created (or last prompted) with.
  const model =
    typeof opts.model === 'string' && opts.model.includes('/')
      ? opts.model
      : typeof p.options?.model === 'string'
        ? p.options.model
        : undefined
  if (opts.model && model && p.options?.model !== model) {
    p.options = { ...p.options, model }
    void db.prisma.project
      .update({ where: { id: p.id }, data: { options: JSON.stringify(p.options) } })
      .catch(() => {})
  }
  const s = await promptSession(
    {
      projectId: p.id,
      ws,
      agent,
      sessionFile: p.sessionFile,
      // The words decide the toolkit when the workspace is still empty, and
      // widen it later: "now turn this deck into a video" needs motion tools
      // the deck session was never given.
      prompt: `${p.prompt ?? ''}\n${text}`,
      uploads: opts.uploads?.map(u => u.name),
      model,
    },
    text,
    context,
  )
  billTurn(p, s.turn)
  if (first) followFirstTurn(p, s.turn)
  if (p.lastError)
    await db.prisma.project
      .update({ where: { id: p.id }, data: { lastError: null } })
      .catch(() => {})
}

/**
 * Bill the turn when it settles. Nothing was charged to open the project, so
 * this is where the money is: the model spend it used plus the machine time
 * its host actions burned.
 */
function billTurn(p: ProjectRow, turn: number): void {
  const off = onProjectEvent(p.id, (ev: StudioEvent) => {
    if (ev.type !== 'idle' || ev.turn !== turn) return
    off()
    void chargeTurn(p, takeModelCost(p.id)).catch(err =>
      logger.warn({ err, projectId: p.id }, 'could not bill the turn'),
    )
  })
}

/** Flag the first turn when it ends without anything usable. */
function followFirstTurn(p: ProjectRow, turn: number): void {
  const off = onProjectEvent(p.id, (ev: StudioEvent) => {
    if (ev.type !== 'idle' || ev.turn !== turn) return
    off()
    void (async () => {
      const agent = getAgent()
      const ok = await agent.hasResult(workspaceOf(p)).catch(() => false)
      if (ok) {
        await syncOutputs(p.userId, p.id).catch(() => {})
        return
      }
      await failProject(
        p,
        ev.aborted
          ? 'Stopped before anything was produced'
          : ev.failed
            ? 'The agent failed'
            : 'The agent finished without producing anything',
        true,
      )
    })()
  })
}

export async function failProject(p: ProjectRow, error: string, refund: boolean): Promise<void> {
  await db.prisma.project
    .update({ where: { id: p.id }, data: { lastError: error } })
    .catch(() => {})
  if (refund && p.creditsCharged > 0) {
    await db
      .addCredits(p.userId, p.creditsCharged, 'refund', 'Refund: the project produced nothing', {
        projectId: p.id,
        idempotencyKey: `refund:project:${p.id}`,
      })
      .catch(err => logger.warn({ err, projectId: p.id }, 'refund failed'))
  }
  emitProjectEvent(p.id, {
    type: 'project',
    project: await getRow(p.userId, p.id).catch(() => null),
  })
}

/** Record an output published to object storage on the project row. */
/**
 * The project row a workspace belongs to. Flow-agnostic on purpose: a
 * workspace is identified by its owner and its name, and what the agent has
 * been asked to make in it can change from one turn to the next.
 */
export async function projectRowFor(ws: { userId: string; name: string }) {
  return db.prisma.project.findFirst({ where: { userId: ws.userId, name: ws.name } })
}

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
  emitProjectEvent(id, { type: 'project', project: updated })
  void dispatchProjectWebhooks(updated)
  return updated
}

/** Flows publish outputs themselves; this re-reads the workspace after a turn as a safety net. */
export async function syncOutputs(userId: string, id: string): Promise<void> {
  const p = await getRow(userId, id)
  emitProjectEvent(id, { type: 'project', project: p })
}

export async function stopProject(userId: string, id: string): Promise<boolean> {
  const p = await getRow(userId, id)
  return stopSession(p.id)
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const p = await getRow(userId, id)
  const ws = workspaceOf(p)
  await closeSession(p.id, p.sessionFile, ws.dir)
  emitProjectEvent(p.id, { type: 'deleted' })
  await db.prisma.project.delete({ where: { id } })
  if (path.dirname(ws.dir) === PROJECTS_DIR && existsSync(ws.dir)) {
    await rm(ws.dir, { recursive: true, force: true })
  }
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
  emitProjectEvent(id, { type: 'project', project: updated })
  return updated
}

// ── Sharing ───────────────────────────────────────────────────────────────────

function slug(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

export async function shareProject(userId: string, id: string): Promise<ProjectRow> {
  const p = await getRow(userId, id)
  if (p.isPublic && p.shareSlug) return p
  const row = await db.prisma.project.update({
    where: { id },
    data: { isPublic: true, shareSlug: p.shareSlug ?? slug() },
  })
  return parseRow(row)
}

export async function unshareProject(userId: string, id: string): Promise<ProjectRow> {
  await getRow(userId, id)
  const row = await db.prisma.project.update({ where: { id }, data: { isPublic: false } })
  return parseRow(row)
}

export async function getPublicProject(shareSlug: string): Promise<ProjectRow | null> {
  const r = await db.prisma.project.findFirst({ where: { shareSlug, isPublic: true } })
  if (!r) return null
  await db.prisma.project
    .update({ where: { id: r.id }, data: { shareViews: { increment: 1 } } })
    .catch(() => {})
  return parseAndUpgradeRow(r)
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
