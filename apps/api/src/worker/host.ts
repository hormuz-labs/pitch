/**
 * The worker host: what a project gets from the process that holds its lease.
 *
 * A held project is a pi session, a workspace directory on this disk, a file
 * watcher, and the host tools that run against it. This module is the only
 * thing that touches those; the API reaches it either directly (same
 * process, role `all`) or through the worker contract (worker/routes.ts).
 *
 * Every operation starts by checking the lease: the Project row must name
 * this worker at this epoch. That is the fence. A worker that lost its lease
 * — it was dead for a while, or it was drained — finds out here, drops the
 * project and answers 409; whoever holds it now is the truth.
 *
 * Lifecycle of a held project:
 *
 *   open       reconcile the local copy with Project.workspaceVersion
 *              (warm: keep; stale or missing: restore from the checkpoint)
 *   work       prompts, exports, assets … changes mark it dirty
 *   checkpoint once it has been quiet for a moment, stream it to the bucket
 *              and bump the version (fenced by the lease)
 *   release    idle for a long time, or draining: checkpoint, close the
 *              session, give the lease back — the directory stays as a warm
 *              cache and is preferred by the next placement
 */
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { getAgent } from '../flows/index.js'
import type { Description, UploadRef } from '../flows/types.js'
import {
  type Asset,
  addAssets as addAssetsTo,
  assetThumbnail as assetThumbnailOf,
  deleteAsset as deleteAssetFrom,
  listAssets as listAssetsOf,
  type ThumbRequest,
} from '../projects/assets.js'
import { durationOptionFromText, videoTypeOptionFromText } from '../projects/creation-options.js'
import { cancelExport, type ExportStatus, exportProject, getExport } from '../projects/export.js'
import {
  addOutput,
  failProject,
  getRow,
  type ProjectRow,
  parseRow,
  rowById,
  syncOutputs,
  workspaceOf,
} from '../projects/rows.js'
import { projectThumbnail } from '../projects/thumbnails.js'
import {
  chargeTurn,
  generationReservationFromEstimate,
  projectedCreditsOwed,
} from '../projects/usage.js'
import { emitProjectEvent, onProjectEvent, type StudioEvent } from '../studio/events.js'
import { deleteWorkspaceHistory } from '../studio/history.js'
import { peekComputeSeconds, setHostActionGuard } from '../studio/host-actions.js'
import {
  estimatedModelCredits,
  modelCreditMultiplier,
  selectStudioModel,
  videoGenerationCostUsd,
} from '../studio/model-picker.js'
import { PROJECTS_DIR, type Workspace } from '../studio/paths.js'
import {
  closeSession,
  closeStudio,
  type Entry,
  getSessionEntries,
  listStudioModels,
  onSessionBusy,
  type PromptDelivery,
  peekModelCost,
  peekSession,
  promptSession,
  resolveAskAnswer,
  rollbackSession,
  steerQueuedPrompt,
  stopSession,
  takeModelCost,
} from '../studio/session.js'
import {
  deleteCheckpoints,
  pruneCheckpoints,
  readMarker,
  restoreCheckpoint,
  uploadCheckpoint,
  writeMarker,
} from './checkpoint.js'
import { CHECKPOINT_SETTLE_MS, CHECKPOINTS_ENABLED, IDLE_RELEASE_MS, WORKER_ID } from './config.js'
import { release as releaseLease } from './lease.js'
import { currentEpoch, setDraining } from './registry.js'

const logger = createLogger('studio:host')
const BILLABLE_GENERATION_ACTIONS = new Set([
  'elevenlabs_voiceover',
  'elevenlabs_music',
  'elevenlabs_sound',
  'demo_record_start',
  'demo_render',
  'edit_render',
  'media_ffmpeg',
  'video_generate',
])
const activatedReservations = new Set<string>()

setHostActionGuard(async (ws, name) => {
  if (!BILLABLE_GENERATION_ACTIONS.has(name)) return
  const row = await db.prisma.project.findFirst({ where: { userId: ws.userId, name: ws.name } })
  if (!row) return
  const p = parseRow(row)
  const kind = generationKind(p.options)
  if (!kind) return
  const key = `project:${p.id}:initial-generation`
  const existing = await db.getCreditReservation(key)
  if (existing?.status === 'pending') {
    activatedReservations.add(key)
    return
  }
  if (existing?.status === 'settled') return
  const model = String(p.options.model ?? '')
  const duration = Number(p.options.durationSeconds ?? 30)
  const credits = generationReservationFromEstimate(
    estimatedModelCredits(model, duration),
    kind,
    duration,
  )
  try {
    await db.reserveCredits({
      key,
      userId: p.userId,
      projectId: p.id,
      channel: p.source === 'api' ? 'api' : 'product',
      kind,
      durationSeconds: duration,
      credits,
    })
    activatedReservations.add(key)
  } catch {
    emitProjectEvent(p.id, {
      type: 'credit_exhausted',
      message: 'You need more credits to start generation.',
    })
    throw new Error('Insufficient credits. Add a one-time top-up to continue.')
  }
})

export class NotOwnerError extends Error {
  status = 409
  code = 'NOT_OWNER'
  constructor(projectId: string) {
    super(`This worker does not hold project ${projectId}`)
  }
}

interface Held {
  id: string
  ws: Workspace
  epoch: number
  /** When the workspace last changed and has not been checkpointed since; 0 when clean. */
  dirtyAt: number
  lastActivity: number
  /** Open event streams; a project with an audience is never released as idle. */
  subscribers: number
  checkpointing: Promise<void> | null
  off: () => void
}

const held = new Map<string, Held>()
const opening = new Map<string, Promise<{ h: Held; row: ProjectRow }>>()

export function holds(projectId: string): boolean {
  return held.has(projectId)
}

export function heldProjects(): string[] {
  return [...held.keys()]
}

function touch(h: Held): void {
  h.lastActivity = Date.now()
}

function markDirty(h: Held): void {
  h.dirtyAt = Date.now()
  h.lastActivity = h.dirtyAt
}

function isBusy(id: string): boolean {
  return peekSession(id)?.busy ?? false
}

function exportRunning(id: string): boolean {
  try {
    return getExport(id).running
  } catch {
    return false
  }
}

// ── Opening ───────────────────────────────────────────────────────────────────

/**
 * Make the local copy match Project.workspaceVersion.
 *
 * A directory whose marker names this project at this version is warm and
 * kept. One with no marker and a row that was never checkpointed is a
 * workspace from before checkpoints existed — the single-box layout — and is
 * adopted as it is. Anything else is stale (another project's leftovers under
 * a reused name, or an older version) and is replaced by the checkpoint.
 */
async function reconcile(row: ProjectRow, ws: Workspace): Promise<ProjectRow> {
  const exists = existsSync(ws.dir)
  const marker = exists ? await readMarker(ws.dir) : null
  const mine = marker?.projectId === row.id
  if (exists && mine && marker && marker.version >= row.workspaceVersion) return row
  if (exists && !marker && row.workspaceVersion === 0) {
    await writeMarker(ws.dir, { projectId: row.id, version: 0 })
    return row
  }
  if (row.workspaceVersion === 0 || !CHECKPOINTS_ENABLED) {
    if (exists && marker && !mine) {
      logger.info({ projectId: row.id, stale: marker.projectId }, 'replacing a stale workspace')
      await rm(ws.dir, { recursive: true, force: true })
      await deleteWorkspaceHistory(ws.dir)
    }
    if (!existsSync(ws.dir)) await mkdir(ws.dir, { recursive: true })
    if (!(await readMarker(ws.dir)))
      await writeMarker(ws.dir, { projectId: row.id, version: row.workspaceVersion })
    return row
  }
  const { sessionFile } = await restoreCheckpoint(row.id, ws, row.workspaceVersion)
  if (sessionFile !== row.sessionFile) {
    await db.prisma.project.updateMany({
      where: { id: row.id, workerId: WORKER_ID, workerEpoch: currentEpoch() },
      data: { sessionFile },
    })
    return { ...row, sessionFile }
  }
  return row
}

function onEvent(h: Held, ev: StudioEvent): void {
  touch(h)
  switch (ev.type) {
    case 'preview':
    case 'assets':
    case 'reset':
      markDirty(h)
      break
    case 'idle':
      // The transcript grew even when nothing on disk did.
      markDirty(h)
      void refreshArtifactKind(h)
      break
  }
}

async function refreshArtifactKind(h: Held): Promise<void> {
  try {
    const kind = await getAgent().artifactKind(h.ws)
    await db.prisma.project.updateMany({
      where: { id: h.id, workerId: WORKER_ID, workerEpoch: h.epoch },
      data: { artifactKind: kind },
    })
  } catch (err) {
    logger.warn({ err, projectId: h.id }, 'could not refresh artifact kind')
  }
}

async function open(row: ProjectRow, epoch: number): Promise<{ h: Held; row: ProjectRow }> {
  const ws = workspaceOf(row)
  const fresh = await reconcile(row, ws)
  // A turn cannot survive worker/session restoration. Clear the old lease's
  // marker so project lists do not advertise interrupted work as still active.
  if (fresh.busyAt) {
    await db.prisma.project.updateMany({
      where: { id: row.id, workerId: WORKER_ID, workerEpoch: epoch },
      data: { busyAt: null },
    })
    fresh.busyAt = null
  }
  const h: Held = {
    id: row.id,
    ws,
    epoch,
    dirtyAt: 0,
    lastActivity: Date.now(),
    subscribers: 0,
    checkpointing: null,
    off: () => {},
  }
  h.off = onProjectEvent(row.id, ev => onEvent(h, ev))
  held.set(row.id, h)
  logger.info({ projectId: row.id, version: fresh.workspaceVersion }, 'project held')
  return { h, row: fresh }
}

/** The held project, opening it if this is the first touch since the lease landed. */
async function ensureOpen(projectId: string): Promise<{ h: Held; row: ProjectRow }> {
  const row = await rowById(projectId)
  const epoch = currentEpoch()
  if (row.workerId !== WORKER_ID || row.workerEpoch !== epoch) {
    if (held.has(projectId)) await unload(projectId, 'lease lost')
    throw new NotOwnerError(projectId)
  }
  const existing = held.get(projectId)
  if (existing) {
    touch(existing)
    return { h: existing, row }
  }
  let pending = opening.get(projectId)
  if (!pending) {
    pending = open(row, epoch).finally(() => opening.delete(projectId))
    opening.set(projectId, pending)
  }
  return pending
}

// ── Sessions ──────────────────────────────────────────────────────────────────

function sessionOptions(p: ProjectRow) {
  return { projectId: p.id, ws: workspaceOf(p), agent: getAgent(), sessionFile: p.sessionFile }
}

export interface PromptOptions {
  first?: boolean
  targets?: Array<Record<string, any>>
  scene?: string | null
  slide?: number | null
  uploads?: UploadRef[]
  /** Extra per-turn option overrides (e.g. a newly picked music bed). */
  options?: Record<string, any>
  answer?: import('../studio/session.js').AskAnswer
  /** This turn's model pick; overrides the one stored in the project's options. */
  model?: string
  /** While busy, queue after the active turn or steer it at the next model boundary. */
  delivery?: PromptDelivery
  /** Text shown in the thread when `text` also contains a generated target legend. */
  displayText?: string
  /** Explicit billing pool for service-created turns. */
  billingChannel?: 'product' | 'api' | 'discord'
}

export interface PromptProjectResult {
  delivery: 'started' | 'queued' | 'steered'
  turn: number
  entryId: string
}

/** Seed the workspace: directories, uploads, a parsed deck, a music bed. */
export async function prepare(
  projectId: string,
  options: Record<string, any>,
  uploads: UploadRef[],
): Promise<void> {
  const { h } = await ensureOpen(projectId)
  await getAgent().prepare(h.ws, options, uploads)
  markDirty(h)
}

export async function prompt(
  projectId: string,
  text: string,
  opts: PromptOptions = {},
): Promise<PromptProjectResult> {
  const { h, row: p } = await ensureOpen(projectId)
  const agent = getAgent()
  const ws = h.ws
  const first = opts.first ?? false
  const resolvedAnswer = opts.answer ? resolveAskAnswer(p.id, opts.answer) : null
  if (resolvedAnswer) {
    text = resolvedAnswer.text
    opts.displayText = resolvedAnswer.text
  }
  const inferredOptions = {
    ...durationOptionFromText(text),
    ...videoTypeOptionFromText(text),
    ...resolvedAnswer?.options,
  }
  if (Object.keys(inferredOptions).length) {
    p.options = { ...p.options, ...inferredOptions }
    await Promise.all([
      db.prisma.project.update({
        where: { id: p.id },
        data: { options: JSON.stringify(p.options) },
      }),
      agent.prepare(ws, p.options, []),
    ])
  }
  const model = selectStudioModel(await listStudioModels(p.userId), opts.model, p.options?.model)
  const kind = generationKind(p.options)
  const reservationKey = kind ? `project:${p.id}:initial-generation` : undefined
  const resolvedBrief =
    typeof p.options.videoType === 'string' ||
    ['generated-video', 'recording-edit'].includes(String(p.options.skill ?? ''))
  if (reservationKey && resolvedBrief) {
    const resolvedKind = kind!
    const existing = await db.getCreditReservation(reservationKey)
    if (!existing || existing.status === 'released') {
      const duration = Number(p.options.durationSeconds ?? 30)
      const credits = generationReservationFromEstimate(
        estimatedModelCredits(model, duration),
        resolvedKind,
        duration,
      )
      try {
        await db.reserveCredits({
          key: reservationKey,
          userId: p.userId,
          projectId: p.id,
          channel: opts.billingChannel ?? (p.source === 'api' ? 'api' : 'product'),
          kind: resolvedKind,
          durationSeconds: duration,
          credits,
        })
      } catch {
        const balance = await db.getAvailableCreditBalance(p.userId)
        throw Object.assign(new Error(`Insufficient credits (balance: ${balance})`), {
          status: 402,
          balance,
        })
      }
    }
  }
  if (opts.uploads?.length && !first)
    await agent.prepare(ws, { ...p.options, ...opts.options }, opts.uploads)
  const context = () =>
    agent.context(ws, {
      first,
      options: { ...p.options, ...(opts.options ?? {}) },
      targets: opts.targets,
      scene: opts.scene ?? null,
      slide: opts.slide ?? null,
    })
  // This turn's pick wins; otherwise the project keeps running on the model
  // it was created (or last prompted) with.
  if (p.options?.model !== model) {
    p.options = { ...p.options, model }
    void db.prisma.project
      .update({ where: { id: p.id }, data: { options: JSON.stringify(p.options) } })
      .catch(() => {})
  }
  let watchedTurn = 0
  let stopWatchingReservation: (() => void) | null = null
  if (reservationKey)
    stopWatchingReservation = onProjectEvent(p.id, (event: StudioEvent) => {
      if (event.type === 'idle' && event.turn === watchedTurn) stopWatchingReservation?.()
      if (event.type === 'tool' && event.name !== 'ask_user') {
        activatedReservations.add(reservationKey)
        stopWatchingReservation?.()
      }
    })
  const result = await promptSession(
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
    opts.delivery,
    opts.displayText,
  )
  watchedTurn = result.turn
  markDirty(h)
  if (result.delivery !== 'steered') {
    billTurn(p, result.turn, opts.billingChannel, model, reservationKey)
    guardTurnCredits(p, result.turn, model, reservationKey)
  }
  if (result.delivery === 'steered') stopWatchingReservation?.()
  if (first) followFirstTurn(p, result.turn)
  if (p.lastError)
    await db.prisma.project
      .update({ where: { id: p.id }, data: { lastError: null } })
      .catch(() => {})
  return { delivery: result.delivery, turn: result.turn, entryId: result.entryId }
}

function generationKind(options: Record<string, any>): string | null {
  if (typeof options.videoType === 'string') return options.videoType
  return ['launch-video', 'demo-video', 'generated-video', 'recording-edit'].includes(options.skill)
    ? options.skill
    : null
}

/** Stop between model/tool boundaries when the accrued turn can no longer be paid for. */
function guardTurnCredits(
  p: ProjectRow,
  turn: number,
  model: string,
  reservationKey?: string,
): void {
  let checking = false
  let stopped = false
  const off = onProjectEvent(p.id, (ev: StudioEvent) => {
    if (ev.type !== 'idle' || ev.turn !== turn) return
    stopped = true
    clearInterval(timer)
    off()
  })
  const check = async () => {
    if (checking || stopped) return
    checking = true
    try {
      const [balance, ledgerBalance, row, reservation] = await Promise.all([
        db.getAvailableCreditBalance(p.userId),
        db.getCreditBalance(p.userId),
        db.prisma.project.findUnique({
          where: { id: p.id },
          select: { usageUsd: true, creditsCharged: true },
        }),
        reservationKey ? db.getCreditReservation(reservationKey) : null,
      ])
      if (stopped) return
      if (!row) return
      const owed = projectedCreditsOwed(
        row.usageUsd,
        row.creditsCharged,
        {
          modelUsd: peekModelCost(p.id),
          computeSeconds: peekComputeSeconds(workspaceOf(p).internal),
        },
        modelCreditMultiplier(model),
      )
      if (owed <= 0) return
      const allowance = reservation?.status === 'pending' ? reservation.credits + balance : balance
      emitProjectEvent(p.id, {
        type: 'credit_balance',
        balance: Math.max(
          0,
          ledgerBalance -
            (reservation?.status === 'pending' ? reservation.credits : 0) -
            Math.max(0, owed - (reservation?.credits ?? 0)),
        ),
      })
      if (owed <= allowance) return
      stopped = true
      emitProjectEvent(p.id, {
        type: 'credit_exhausted',
        message: 'Your credits ran out, so generation was stopped.',
      })
      await stopSession(p.id)
    } catch (err) {
      logger.warn({ err, projectId: p.id }, 'could not check live credit balance')
    } finally {
      checking = false
    }
  }
  const timer = setInterval(() => void check(), 1000)
  void check()
}

/**
 * Bill the turn when it settles. Nothing was charged to open the project, so
 * this is where the money is: the model spend it used plus the machine time
 * its host actions burned.
 */
function billTurn(
  p: ProjectRow,
  turn: number,
  channel: 'product' | 'api' | 'discord' = p.source === 'api' ? 'api' : 'product',
  model?: string,
  reservationKey?: string,
): void {
  const off = onProjectEvent(p.id, (ev: StudioEvent) => {
    if (ev.type !== 'idle' || ev.turn !== turn) return
    off()
    void (async () => {
      const reservation = reservationKey ? await db.getCreditReservation(reservationKey) : null
      const pendingKey =
        reservation?.status === 'pending' &&
        reservationKey &&
        activatedReservations.has(reservationKey)
          ? reservationKey
          : undefined
      const providerUsd =
        pendingKey && model
          ? videoGenerationCostUsd(model, Number(p.options?.durationSeconds ?? 30))
          : 0
      const modelUsd = takeModelCost(p.id)
      if (reservationKey && reservation?.status === 'pending' && !pendingKey)
        await db.releaseCreditReservation(reservationKey)
      await chargeTurn(
        p,
        modelUsd,
        channel,
        model,
        providerUsd,
        pendingKey ? (reservation?.credits ?? 0) : 0,
        pendingKey,
      )
      emitProjectEvent(p.id, {
        type: 'credit_balance',
        balance: await db.getCreditBalance(p.userId),
      })
    })()
      .catch(err => logger.warn({ err, projectId: p.id }, 'could not bill the turn'))
      .finally(() => {
        if (reservationKey) activatedReservations.delete(reservationKey)
      })
  })
}

/** Sync the first output and flag actual failures, not conversational turns. */
export function followFirstTurn(p: ProjectRow, turn: number): void {
  let waitingForQueue = false
  const off = onProjectEvent(p.id, (ev: StudioEvent) => {
    if (ev.type !== 'idle') return
    if (!waitingForQueue && ev.turn !== turn) return
    // A queued follow-up may be the turn that produces the first artifact, so
    // assess the project only after the accepted queue drains.
    if (ev.busy) {
      waitingForQueue = true
      return
    }
    off()
    void (async () => {
      const agent = getAgent()
      const ok = await agent.hasResult(workspaceOf(p)).catch(() => false)
      if (ok) {
        await syncOutputs(p.userId, p.id).catch(() => {})
        return
      }
      // A greeting, explanation or question card can finish successfully with
      // no artifact. Keep the project empty and ready for the next message.
      if (!ev.aborted && !ev.failed) return
      await failProject(
        p,
        ev.aborted ? 'Stopped before anything was produced' : 'The agent failed',
        true,
      )
    })()
  })
}

export async function stop(projectId: string): Promise<boolean> {
  await ensureOpen(projectId)
  return stopSession(projectId)
}

export async function steer(projectId: string, entryId: string): Promise<boolean> {
  await ensureOpen(projectId)
  return steerQueuedPrompt(projectId, entryId)
}

export interface RollbackProjectResult {
  text: string
  entries: Entry[]
  project: ProjectRow
}

export async function rollback(projectId: string, entryId: string): Promise<RollbackProjectResult> {
  const { h, row: p } = await ensureOpen(projectId)
  const result = await rollbackSession(sessionOptions(p), entryId)
  markDirty(h)
  const row = await db.prisma.project.update({
    where: { id: p.id },
    data: {
      outputs: result.project.outputs as any,
      thumbnailUrl: result.project.thumbnailUrl,
      lastError: result.project.lastError,
    },
  })
  const project = parseRow(row)
  emitProjectEvent(p.id, { type: 'project', project })
  return { text: result.text, entries: result.entries, project }
}

export async function entries(
  projectId: string,
): Promise<{ entries: Entry[]; busy: boolean; activeModel: string | null }> {
  const { row } = await ensureOpen(projectId)
  const session = peekSession(projectId)
  return {
    entries: await getSessionEntries(sessionOptions(row)),
    busy: session?.busy ?? false,
    activeModel: session?.busy ? (session.active?.model ?? null) : null,
  }
}

export async function busy(projectId: string): Promise<boolean> {
  await ensureOpen(projectId)
  return isBusy(projectId)
}

export async function describe(projectId: string): Promise<Description> {
  const { h } = await ensureOpen(projectId)
  return describeWorkspace(h.ws, projectId)
}

async function describeWorkspace(ws: Workspace, projectId: string): Promise<Description> {
  if (!existsSync(ws.dir)) return { preview: null, outputs: [] }
  try {
    return await getAgent().describe(ws)
  } catch (err: any) {
    logger.warn({ err, projectId }, 'describe failed')
    return { preview: null, outputs: [], error: err.message }
  }
}

export async function thumbnail(projectId: string, t: number): Promise<Buffer | null> {
  const { row } = await ensureOpen(projectId)
  return projectThumbnail(row, t)
}

// ── Assets ────────────────────────────────────────────────────────────────────

export async function listAssets(projectId: string): Promise<Asset[]> {
  const { h } = await ensureOpen(projectId)
  return listAssetsOf(h.ws, projectId)
}

export async function addAssets(projectId: string, uploads: UploadRef[]): Promise<Asset[]> {
  const { h } = await ensureOpen(projectId)
  const added = await addAssetsTo(h.ws, projectId, uploads)
  if (added.length) markDirty(h)
  return added
}

export async function deleteAsset(projectId: string, rel: string): Promise<boolean> {
  const { h } = await ensureOpen(projectId)
  const removed = await deleteAssetFrom(h.ws, rel)
  if (removed) markDirty(h)
  return removed
}

export async function assetThumbnail(projectId: string, req: ThumbRequest): Promise<Buffer | null> {
  const { h } = await ensureOpen(projectId)
  return assetThumbnailOf(h.ws, req)
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function startExport(
  projectId: string,
  body: Record<string, any>,
): Promise<ExportStatus> {
  const { h, row } = await ensureOpen(projectId)
  const status = await exportProject(row.userId, projectId, body)
  markDirty(h)
  return status
}

export async function exportStatus(projectId: string): Promise<ExportStatus> {
  await ensureOpen(projectId)
  return getExport(projectId)
}

export async function stopExport(projectId: string): Promise<boolean> {
  await ensureOpen(projectId)
  return cancelExport(projectId)
}

// ── Events ────────────────────────────────────────────────────────────────────

/** Attach a listener; the first event it gets is `hello`. */
export async function subscribe(
  projectId: string,
  listener: (ev: StudioEvent) => void,
): Promise<() => void> {
  const { h } = await ensureOpen(projectId)
  h.subscribers++
  const session = peekSession(projectId)
  listener({
    type: 'hello',
    busy: session?.busy ?? false,
    activeModel: session?.busy ? (session.active?.model ?? null) : null,
  })
  const off = onProjectEvent(projectId, listener)
  let done = false
  return () => {
    if (done) return
    done = true
    off()
    h.subscribers = Math.max(0, h.subscribers - 1)
    touch(h)
  }
}

/** An event from elsewhere (an API replica) for a project we hold. False when we do not. */
export function emit(projectId: string, ev: StudioEvent): boolean {
  if (!held.has(projectId)) return false
  emitProjectEvent(projectId, ev)
  return true
}

// ── Workspace files ───────────────────────────────────────────────────────────

/** The directory to serve `internal` from, if this worker holds that project. */
export async function workspaceDir(row: ProjectRow): Promise<string> {
  const { h } = await ensureOpen(row.id)
  return h.ws.dir
}

// ── Checkpoints, release, removal ─────────────────────────────────────────────

async function checkpointNow(h: Held): Promise<void> {
  if (h.checkpointing) return h.checkpointing
  h.checkpointing = (async () => {
    const at = h.dirtyAt
    if (!CHECKPOINTS_ENABLED) {
      if (h.dirtyAt === at) h.dirtyAt = 0
      return
    }
    const row = await rowById(h.id)
    if (row.workerId !== WORKER_ID || row.workerEpoch !== h.epoch) {
      await unload(h.id, 'lease lost before checkpoint')
      return
    }
    const version = row.workspaceVersion + 1
    await uploadCheckpoint({
      projectId: h.id,
      ws: h.ws,
      version,
      sessionFile: row.sessionFile,
      artifactKind: await getAgent()
        .artifactKind(h.ws)
        .catch(() => null),
    })
    const fenced = await db.prisma.project.updateMany({
      where: {
        id: h.id,
        workerId: WORKER_ID,
        workerEpoch: h.epoch,
        workspaceVersion: row.workspaceVersion,
      },
      data: { workspaceVersion: version, workspaceCheckpointAt: new Date() },
    })
    if (fenced.count === 0) {
      logger.warn({ projectId: h.id, version }, 'checkpoint fenced out: lease lost')
      await unload(h.id, 'lease lost during checkpoint')
      return
    }
    await writeMarker(h.ws.dir, { projectId: h.id, version })
    if (h.dirtyAt === at) h.dirtyAt = 0
    void pruneCheckpoints(h.id).catch(err =>
      logger.warn({ err, projectId: h.id }, 'could not prune old checkpoints'),
    )
  })().finally(() => {
    h.checkpointing = null
  })
  return h.checkpointing
}

/**
 * The render tier's view of a workspace: the checkpoint it can restore. A
 * dirty workspace is checkpointed first, so what the render pod sees is
 * what the agent just wrote. Returns the project and the version to name.
 */
export async function checkpointForRender(
  ws: Workspace,
): Promise<{ projectId: string; version: number }> {
  const h = [...held.values()].find(x => x.ws.internal === ws.internal)
  if (!h) throw new Error(`this worker does not hold ${ws.internal}; nothing to render from`)
  if (!CHECKPOINTS_ENABLED)
    throw new Error('remote renders need workspace checkpoints (STUDIO_WORKSPACE_BUCKET)')
  // Dirty, or never checkpointed (a workspace adopted from before
  // checkpoints existed): either way the bucket must hold what is on disk.
  if (h.dirtyAt || (await rowById(h.id)).workspaceVersion === 0) await checkpointNow(h)
  const row = await rowById(h.id)
  if (row.workerId !== WORKER_ID || row.workerEpoch !== h.epoch) throw new NotOwnerError(h.id)
  if (row.workspaceVersion === 0) throw new Error(`${ws.internal} could not be checkpointed`)
  return { projectId: h.id, version: row.workspaceVersion }
}

/** Files landed in a held workspace from outside the session (a render came back). */
export function noteExternalWrite(projectId: string): void {
  const h = held.get(projectId)
  if (h) markDirty(h)
}

/** Checkpoint now if anything changed; used by tests and the drain path. */
export async function checkpoint(projectId: string): Promise<boolean> {
  const h = held.get(projectId)
  if (!h?.dirtyAt) return false
  await checkpointNow(h)
  return true
}

/** Drop a project without checkpointing: its lease is no longer ours. */
async function unload(projectId: string, reason: string): Promise<void> {
  const h = held.get(projectId)
  if (!h) return
  held.delete(projectId)
  h.off()
  logger.warn({ projectId, reason }, 'unloading project')
  await stopSession(projectId).catch(() => {})
  await closeSession(projectId, null, h.ws.dir).catch(() => {})
}

/**
 * Checkpoint, close the session and give the lease back. The directory is
 * left in place: the next placement prefers this worker while it lives, and
 * the marker tells the next open whether it can be reused.
 */
export async function release(projectId: string): Promise<void> {
  const h = held.get(projectId)
  if (!h) {
    await releaseLease(projectId, WORKER_ID, currentEpoch())
    return
  }
  if (isBusy(projectId)) await stopSession(projectId).catch(() => {})
  try {
    if (h.dirtyAt) await checkpointNow(h)
  } catch (err) {
    logger.error({ err, projectId }, 'checkpoint failed on release; keeping the lease')
    throw err
  }
  if (!held.has(projectId)) return
  held.delete(projectId)
  h.off()
  await closeSession(projectId, null, h.ws.dir).catch(() => {})
  await releaseLease(projectId, WORKER_ID, h.epoch)
  emitProjectEvent(projectId, { type: 'status', busy: false })
  logger.info({ projectId }, 'project released')
}

/** Delete everything local: session, transcript, history, workspace. */
export async function remove(projectId: string, row: ProjectRow): Promise<void> {
  const h = held.get(projectId)
  const ws = h?.ws ?? workspaceOf(row)
  if (h) {
    held.delete(projectId)
    h.off()
  }
  await closeSession(projectId, row.sessionFile, ws.dir)
  await deleteWorkspaceHistory(ws.dir)
  if (path.dirname(ws.dir) === PROJECTS_DIR && existsSync(ws.dir))
    await rm(ws.dir, { recursive: true, force: true })
  await deleteCheckpoints(projectId).catch(err =>
    logger.warn({ err, projectId }, 'could not delete workspace checkpoints'),
  )
}

/** Wipe a local copy this worker does not hold (the row is gone). */
export async function discardLocal(row: ProjectRow): Promise<void> {
  const ws = workspaceOf(row)
  if (path.dirname(ws.dir) !== PROJECTS_DIR) return
  const marker = await readMarker(ws.dir)
  if (!existsSync(ws.dir) || (marker && marker.projectId !== row.id)) return
  await rm(ws.dir, { recursive: true, force: true })
  await deleteWorkspaceHistory(ws.dir)
}

/** Every held project is abandoned: the lease is void (see registry.ts). */
export async function unloadAll(reason: string): Promise<void> {
  await Promise.all([...held.keys()].map(id => unload(id, reason)))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Stop taking projects and let go of the ones we hold.
 *
 * With a window (`settleMs`) this is the gentle path a scale-down or a
 * rollout wants: placement stops sending projects here at once, but the
 * worker keeps serving what it holds — the API still reaches it, the lease
 * says so — and releases each project the moment it is not mid-turn or
 * exporting. Whoever is watching reconnects and lands on another worker
 * with the checkpoint. Whatever is still running when the window closes
 * is released anyway, losing that turn. No window is the old behaviour:
 * everything at once.
 */
export async function drain(settleMs = 0): Promise<void> {
  await setDraining(true)
  const deadline = Date.now() + settleMs
  const letGo = (id: string) =>
    release(id).catch(err => logger.error({ err, projectId: id }, 'release failed on drain'))
  while (held.size && Date.now() < deadline) {
    for (const h of [...held.values()]) {
      if (isBusy(h.id) || exportRunning(h.id)) continue
      await letGo(h.id)
    }
    if (!held.size) break
    logger.info({ waiting: held.size }, 'draining: waiting for turns to finish')
    await sleep(Math.max(0, Math.min(2000, deadline - Date.now())))
  }
  if (held.size && settleMs > 0)
    logger.warn({ cut: held.size }, 'drain window closed with turns still running')
  await Promise.all([...held.keys()].map(letGo))
  await closeStudio()
}

// ── Loops ─────────────────────────────────────────────────────────────────────

let loops: NodeJS.Timeout[] = []

async function checkpointTick(): Promise<void> {
  const now = Date.now()
  for (const h of held.values()) {
    if (!h.dirtyAt || h.checkpointing) continue
    if (now - h.lastActivity < CHECKPOINT_SETTLE_MS) continue
    if (isBusy(h.id) || exportRunning(h.id)) continue
    await checkpointNow(h).catch(err =>
      logger.warn({ err, projectId: h.id }, 'workspace checkpoint failed'),
    )
  }
}

async function idleTick(): Promise<void> {
  const now = Date.now()
  for (const h of [...held.values()]) {
    if (h.subscribers > 0 || h.checkpointing) continue
    if (now - h.lastActivity < IDLE_RELEASE_MS) continue
    if (isBusy(h.id) || exportRunning(h.id)) continue
    await release(h.id).catch(err => logger.warn({ err, projectId: h.id }, 'idle release failed'))
  }
}

export function startHostLoops(): void {
  if (loops.length) return
  onSessionBusy((projectId, busy) => {
    const h = held.get(projectId)
    if (h) touch(h)
    void db.prisma.project
      .updateMany({
        where: { id: projectId, workerId: WORKER_ID, workerEpoch: currentEpoch() },
        data: { busyAt: busy ? new Date() : null },
      })
      .catch(() => {})
  })
  const every = (ms: number, fn: () => Promise<void>) => {
    let running = false
    const t = setInterval(() => {
      if (running) return
      running = true
      void fn().finally(() => {
        running = false
      })
    }, ms)
    t.unref()
    loops.push(t)
  }
  every(5000, checkpointTick)
  every(60_000, idleTick)
}

export function stopHostLoops(): void {
  for (const t of loops) clearInterval(t)
  loops = []
  onSessionBusy(null)
}

// Re-exported for the API side, which reads the row and then asks the owner.
export { addOutput, getRow }
