/**
 * Projects: the unit of the studio. Creating one seeds the workspace and
 * starts the first agent turn; work is metered as it runs.
 * Status is derived (session busy + what the flow finds in the workspace);
 * outputs published to object storage are recorded on the row.
 *
 * This is the API's side of a project: authorisation, credits, the row, and
 * placement. Anything that needs the workspace or the session goes to the
 * worker holding the lease (worker/client.ts) — which is this very process
 * in the single-box layout, and some other node otherwise.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import type { Description, UploadRef } from '../flows/types.js'
import { publishProjectEvent } from '../studio/events.js'
import { selectStudioModel } from '../studio/model-picker.js'
import { isValidProjectName, slugify } from '../studio/paths.js'
import { type Entry, listStudioModels } from '../studio/session.js'
import { deleteCheckpoints } from '../worker/checkpoint.js'
import { clientForWorker, currentOwner, forgetOwner, withOwner } from '../worker/client.js'
import { followFirstTurn, type PromptOptions, type PromptProjectResult } from '../worker/host.js'
import { isLive } from '../worker/lease.js'
import { durationOptionFromText, normalizeCreationOptions } from './creation-options.js'
import { notifyProjectStarted } from './notifications.js'
import {
  deleteRow,
  getRow,
  InsufficientCreditsError,
  type ProjectRow,
  type ProjectStatus,
  parseAndUpgradeRow,
  parseRow,
} from './rows.js'
import { projectTitle } from './title.js'
import { MIN_BALANCE } from './usage.js'

export {
  addOutput,
  failProject,
  getRow,
  InsufficientCreditsError,
  NotFoundError,
  type ProjectRow,
  type ProjectStatus,
  projectRowFor,
  rowById,
  syncOutputs,
  updateProject,
  workspaceOf,
} from './rows.js'
export { followFirstTurn, type PromptOptions, type PromptProjectResult }

const logger = createLogger('studio:projects')

export interface ProjectInfo extends ProjectRow {
  status: ProjectStatus
  busy: boolean
}

export interface ProjectDetail extends ProjectInfo {
  description: Description
}

function statusOf(
  p: ProjectRow,
  busy: boolean,
  desc: Description | null,
  /** The worker's cached answer, for lists that do not describe every project. */
  artifact = false,
): ProjectStatus {
  if (busy) return 'working'
  const hasSomething =
    Boolean(desc?.preview) || artifact || p.outputs.length > 0 || (desc?.outputs.length ?? 0) > 0
  if (hasSomething) return 'ready'
  return p.lastError ? 'failed' : 'empty'
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Whether each row's turn is really running: `busyAt` is the worker's word,
 * and it only counts while that worker is alive at the epoch that set it.
 */
export async function busyProjects(rows: ProjectRow[]): Promise<Set<string>> {
  const candidates = rows.filter(r => r.busyAt && r.workerId)
  if (!candidates.length) return new Set()
  const workers = await db.prisma.studioWorker.findMany({
    where: { id: { in: [...new Set(candidates.map(r => r.workerId!))] } },
  })
  const live = new Map(workers.filter(w => isLive(w)).map(w => [w.id, w.epoch]))
  return new Set(candidates.filter(r => live.get(r.workerId!) === r.workerEpoch).map(r => r.id))
}

export async function listProjects(userId: string): Promise<ProjectInfo[]> {
  const rows = await db.prisma.project.findMany({
    where: { userId },
    orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
  })
  const parsed = await Promise.all(rows.map(parseAndUpgradeRow))
  const busy = await busyProjects(parsed)
  // A project opened from a drop has a preview and no output yet, so the row
  // alone cannot tell whether it is empty; the worker keeps artifactKind for
  // exactly this question.
  return parsed.map(p => ({
    ...p,
    busy: busy.has(p.id),
    status: statusOf(p, busy.has(p.id), null, p.artifactKind !== null),
  }))
}

export async function describeProject(p: ProjectRow): Promise<Description> {
  try {
    return await withOwner(p.id, w => w.describe(p.id))
  } catch (err: any) {
    logger.warn({ err, projectId: p.id }, 'describe failed')
    return { preview: null, outputs: [], error: err.message }
  }
}

export async function getProject(userId: string, id: string): Promise<ProjectDetail> {
  const p = await getRow(userId, id)
  try {
    return await withOwner(p.id, async owner => {
      const [description, busy] = await Promise.all([owner.describe(p.id), owner.busy(p.id)])
      return { ...p, busy, status: statusOf(p, busy, description), description }
    })
  } catch (err: any) {
    logger.warn({ err, projectId: p.id }, 'describe failed')
    const description: Description = { preview: null, outputs: [], error: err.message }
    return { ...p, busy: false, status: statusOf(p, false, description), description }
  }
}

export async function getEntries(
  p: ProjectRow,
): Promise<{ entries: Entry[]; busy: boolean; activeModel: string | null }> {
  return withOwner(p.id, w => w.entries(p.id))
}

// ── Writes ────────────────────────────────────────────────────────────────────

async function uniqueName(userId: string, base: string): Promise<string> {
  const taken = new Set(
    (await db.prisma.project.findMany({ where: { userId }, select: { name: true } })).map(
      r => r.name,
    ),
  )
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const n = `${base}-${i}`
    if (!taken.has(n)) return n
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
  const prompt = String(input.prompt ?? '').trim()
  if (!prompt && !input.uploads?.length)
    throw Object.assign(new Error('prompt is required'), { status: 400 })
  const options = normalizeCreationOptions({
    ...input.options,
    ...(durationOptionFromText(prompt) ?? {}),
  })
  options.model = selectStudioModel(
    await listStudioModels(userId),
    typeof input.model === 'string'
      ? input.model
      : typeof options.model === 'string'
        ? options.model
        : undefined,
  )
  const uploads = input.uploads ?? []
  if (Array.isArray(options.referenceVideoFiles)) {
    const uploadedPaths = new Map(
      uploads.map(upload => {
        const originalName = upload.name.split('/').pop() ?? upload.name
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
  const balance = await db.getAvailableCreditBalance(userId)
  if (balance < MIN_BALANCE) throw new InsufficientCreditsError(balance)

  const title = projectTitle(
    prompt,
    uploads.map(upload => upload.name),
  )
  const wanted = input.name && isValidProjectName(input.name) ? input.name : slugify(title)
  const name = await uniqueName(userId, wanted)

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

  try {
    await withOwner(p.id, owner => owner.prepare(p.id, options, uploads))
    if (prompt)
      await promptProject(p, prompt, {
        first: true,
        uploads,
        billingChannel: input.source === 'api' ? 'api' : 'product',
      })
  } catch (err: any) {
    logger.error({ err, projectId: p.id }, 'could not open the project')
    await deleteProject(userId, p.id).catch(cleanupError =>
      logger.warn(
        { err: cleanupError, projectId: p.id },
        'could not clean failed project creation',
      ),
    )
    throw err
  }

  void notifyProjectStarted(p, { prompt }).catch(err =>
    logger.warn({ err, projectId: p.id }, 'project started notification failed'),
  )

  return getProject(userId, p.id)
}

export async function promptProject(
  p: ProjectRow,
  text: string,
  opts: PromptOptions = {},
): Promise<PromptProjectResult> {
  const result = await withOwner(p.id, w => w.prompt(p.id, text, opts))
  await db.prisma.project.update({
    where: { id: p.id },
    data: { lastActivityAt: new Date() },
  })
  return result
}

export async function stopProject(userId: string, id: string): Promise<boolean> {
  const p = await getRow(userId, id)
  const owner = await currentOwner(p.id)
  if (!owner) return false
  return owner.stop(p.id)
}

export async function steerProject(userId: string, id: string, entryId: string): Promise<boolean> {
  const p = await getRow(userId, id)
  const owner = await currentOwner(p.id)
  if (!owner) return false
  return owner.steer(p.id, entryId)
}

export async function rollbackProject(userId: string, id: string, entryId: string) {
  const p = await getRow(userId, id)
  const result = await withOwner(p.id, w => w.rollback(p.id, entryId))
  const row = await db.prisma.project.update({
    where: { id: p.id },
    data: { lastActivityAt: new Date() },
  })
  return { ...result, project: parseRow(row) }
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const p = await deleteRow(userId, id)
  forgetOwner(p.id)
  const workerIds = [...new Set([p.workerId, p.lastWorkerId].filter(Boolean) as string[])]
  const cleanup = await Promise.allSettled(
    workerIds.map(async workerId => {
      const worker = await clientForWorker(workerId)
      if (worker) await worker.remove(p)
    }),
  )
  for (const [index, result] of cleanup.entries()) {
    if (result.status === 'rejected')
      logger.warn(
        { err: result.reason, projectId: p.id, workerId: workerIds[index] },
        'could not remove worker workspace',
      )
  }
  await deleteCheckpoints(p.id).catch(err =>
    logger.warn({ err, projectId: p.id }, 'could not delete workspace checkpoints'),
  )
  publishProjectEvent(p.id, { type: 'deleted' })
}

// ── Sharing ───────────────────────────────────────────────────────────────────

function slug(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

export async function shareProject(userId: string, id: string): Promise<ProjectRow> {
  let p = await getRow(userId, id)
  // A render can exist only in the workspace (for preview/download) while the
  // public row still has no storage URL. Publish the current artifact before
  // returning even for an existing slug, so copying a previously broken link
  // repairs it and a project that changed from deck to video shares the video.
  await withOwner(p.id, owner => owner.publishArtifact(p.id))
  p = await getRow(userId, id)
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
