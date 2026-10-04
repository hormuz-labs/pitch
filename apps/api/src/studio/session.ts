/**
 * One in-process pi AgentSession per project.
 *
 * bash/read/write/edit/grep/find/ls run inside a Gondolin micro-VM with the
 * workspace mounted read-write; everything that needs the host (ffmpeg, a
 * browser, the network) is an extension tool that runs outside it.
 * Pi's events are folded into a flat entry log the studio renders directly
 * and fanned out on the project event bus:
 *
 *   entry / delta / update / tool / status / idle / error
 *
 * The session file is persisted on the Project row so a conversation resumes
 * across restarts.
 */
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type SessionEntry,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import { prisma } from '@saas/db'
import { createLogger } from '@saas/shared'
import { EXTENSIONS } from '../agent/toolkit.js'
import type { getAgent } from '../flows/index.js'
import { ASSET_PATH } from '../projects/assets.js'
import { AUTO_KIND, findStyle } from '../projects/styles.js'
import { emitProjectEvent, type StudioEvent } from './events.js'
import {
  createWorkspaceCheckpoint,
  type ProjectCheckpointState,
  readTurnHistory,
  restoreWorkspaceCheckpoint,
  saveTurnRecord,
  type TurnRecord,
} from './history.js'
import { abortHostActions } from './host-actions.js'
import {
  assembleStudioPicker,
  DEFAULT_STUDIO_MODEL,
  type PickerModel,
  parseModelSpec,
  studioModelSpecs,
  type TokenPrice,
  tokenPriceOf,
} from './model-picker.js'
import { PI_DIR, PI_EXTENSIONS_DIR, SKILLS_DIR, type Workspace } from './paths.js'
import { unwatchWorkspace, watchWorkspace } from './watch.js'

const logger = createLogger('studio:session')

/** Configuration warnings hold for the life of the process: say them once. */
const configWarned = new Set<string>()
function warnConfigOnce(fields: Record<string, unknown>, message: string): void {
  const key = `${message}\0${JSON.stringify(fields.spec ?? '')}`
  if (configWarned.has(key)) return
  configWarned.add(key)
  logger.warn(fields, message)
}

export type EntryRole = 'user' | 'assistant' | 'thinking' | 'tool' | 'question'

/** One answer on a question card. A proposed direction also shows a still and its moments. */
export interface AskOption {
  id: string
  label: string
  hint?: string
  recommended?: boolean
  /** Workspace-relative still (png, jpg, webp) shown on the option. */
  image?: string
  /** Up to three short lines: what the viewer will see. */
  details?: string[]
}

/** One question the studio draws as clickable options (see .pi/extensions/ask-tools.ts). */
export interface AskQuestion {
  id: string
  bind?: 'videoType' | 'durationSeconds'
  question: string
  options: AskOption[]
  multi?: boolean
}

export interface Ask {
  intro?: string
  questions: AskQuestion[]
}

export interface AskAnswer {
  askEntryId: string
  selections: Array<{ questionId: string; optionIds: string[]; customText?: string }>
}

const optionId = (value: unknown, label: string) =>
  String(value ?? label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

export interface Entry {
  id: string
  role: EntryRole
  text: string
  tool?: { name: string; status: 'running' | 'done' | 'error'; callId?: string; progress?: string }
  /** Present on `question` entries only: what the buttons say. */
  ask?: Ask
  at: number
  /** Pi's persistent user-message id, used to branch the transcript. */
  sessionEntryId?: string
  /** Workspace state immediately before this user message ran. */
  checkpointId?: string
  /** User messages accepted but not yet delivered to the model. */
  pending?: 'queued' | 'steering' | 'cancelled'
}

type Agent = ReturnType<typeof getAgent>

interface PendingPrompt {
  text: string
  context?: string | (() => Promise<string>)
  model?: string
  entry: Entry
  turn: number
  usedProvidedSkill: boolean
}

interface PendingSteer {
  entry: Entry
  full: string
}

export interface Session {
  projectId: string
  ws: Workspace
  agent: Agent
  session: any
  entries: Entry[]
  busy: boolean
  counter: number
  textId: string | null
  thinkingId: string | null
  turn: number
  cost: number
  /** Why the last model call failed; pi retries, so only the final one is shown. */
  modelError: string | null
  queue: PendingPrompt[]
  active: PendingPrompt | null
  pendingBindings: Entry[]
  preStartSteers: PendingSteer[]
  stopping: boolean
  providedSkillFiles: Set<string>
  pendingSkillReads: Map<string, number>
}

const sessions = new Map<string, Session>()
const pendingCreates = new Map<string, Promise<Session>>()

function canonicalPath(file: string, cwd: string): string | null {
  try {
    return realpathSync(path.resolve(cwd, file))
  } catch {
    return null
  }
}

export function isProvidedSkillRead(
  toolName: string,
  args: unknown,
  cwd: string,
  providedSkillFiles: ReadonlySet<string>,
): boolean {
  if (toolName !== 'read') return false
  const value = args as { path?: unknown; file?: unknown }
  const named = value?.path ?? value?.file
  if (typeof named !== 'string') return false
  const resolved = canonicalPath(named, cwd)
  return Boolean(resolved && providedSkillFiles.has(resolved))
}

let modelRuntime: any
let initPromise: Promise<void> | null = null

/** Where pi keeps its transcripts; the same path on every studio node. */
export const AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent')
const SANDBOX_EXTENSION = path.join(PI_EXTENSIONS_DIR, 'bwrap-sandbox.ts')
// Must be an id the pi runtime actually has: an unknown one is a warning, not
// an error, and the studio silently falls back to pi's own default — which
// carries no Gemini key here, so the first turn never runs and the project
// sits at "working" forever. Check against the runtime before changing it.
const MODEL_SPEC = process.env.STUDIO_MODEL || DEFAULT_STUDIO_MODEL
const ALLOWED_SPECS = studioModelSpecs()
// A film is planned before it is built; at medium the agent skimmed the plan
// (and invented a token budget to hurry against), so the default is high.
const THINKING_LEVEL = (process.env.STUDIO_THINKING || 'high') as any
const STUDIO_MODELS_JSON = path.join(PI_DIR, 'models.json')

function resolveModel(spec = MODEL_SPEC): { model?: any; thinkingLevel?: any } {
  const { provider, id } = parseModelSpec(spec)
  const model = modelRuntime.getModel(provider, id)
  if (!model) {
    logger.warn({ provider, id }, 'studio model not found in the runtime — using pi default')
    return { thinkingLevel: THINKING_LEVEL }
  }
  return { model, thinkingLevel: THINKING_LEVEL }
}

function openAiApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim()
  return key || undefined
}

function azureApimApiKey(): string | undefined {
  const key = (
    process.env.AZURE_APIM_PRIMARY_KEY ||
    process.env.AZURE_APIM_SECONDARY_KEY ||
    process.env.AZURE_APIM_API_KEY
  )?.trim()
  return key || undefined
}

function googleApiKey(): string | undefined {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)?.trim()
  return key || undefined
}

function providerIsRunnable(provider: string): boolean {
  if (modelRuntime.hasConfiguredAuth(provider)) return true
  if (provider === 'openai') return Boolean(openAiApiKey())
  if (provider === 'azure-apim') return Boolean(azureApimApiKey())
  if (provider === 'google') {
    return Boolean(googleApiKey())
  }
  return false
}

export function initStudio(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      modelRuntime = await ModelRuntime.create({ modelsPath: STUDIO_MODELS_JSON })
      const gKey = googleApiKey()
      if (gKey) {
        try {
          await modelRuntime.setRuntimeApiKey('google', gKey)
        } catch (err) {
          logger.warn({ err }, 'could not apply GEMINI_API_KEY to the model runtime')
        }
      } else if (ALLOWED_SPECS.some(s => parseModelSpec(s).provider === 'google')) {
        warnConfigOnce(
          { allowed: ALLOWED_SPECS },
          'GEMINI_API_KEY is not set — Google models will be hidden from the picker',
        )
      }
      const openAiKey = openAiApiKey()
      if (openAiKey) {
        try {
          await modelRuntime.setRuntimeApiKey('openai', openAiKey)
        } catch (err) {
          logger.warn({ err }, 'could not apply OPENAI_API_KEY to the model runtime')
        }
      } else if (ALLOWED_SPECS.some(s => parseModelSpec(s).provider === 'openai')) {
        warnConfigOnce(
          { allowed: ALLOWED_SPECS },
          'OPENAI_API_KEY is not set — GPT models will be hidden from the picker',
        )
      }
      const azureKey = azureApimApiKey()
      if (azureKey) {
        try {
          await modelRuntime.setRuntimeApiKey('azure-apim', azureKey)
        } catch (err) {
          logger.warn({ err }, 'could not apply AZURE_APIM_API_KEY to the model runtime')
        }
      } else if (ALLOWED_SPECS.some(s => parseModelSpec(s).provider === 'azure-apim')) {
        warnConfigOnce(
          { allowed: ALLOWED_SPECS },
          'AZURE_APIM_API_KEY is not set — Azure models will be hidden from the picker',
        )
      }
      const m = resolveModel()
      logger.info(
        {
          model: m.model ? `${m.model.provider}/${m.model.id}` : '(pi default)',
          allowed: ALLOWED_SPECS,
          google: Boolean(gKey),
          openai: Boolean(openAiKey),
          azureApim: Boolean(azureKey),
          thinking: THINKING_LEVEL,
        },
        'studio model runtime ready',
      )
    })().catch(err => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

function emit(s: Session, ev: StudioEvent): void {
  emitProjectEvent(s.projectId, ev)
}

function addEntry(
  s: Session,
  role: EntryRole,
  text: string,
  tool?: Entry['tool'],
  ask?: Ask,
  pending?: Entry['pending'],
): Entry {
  const entry: Entry = {
    id: `e${++s.counter}`,
    role,
    text,
    at: Date.now(),
    ...(tool ? { tool } : {}),
    ...(ask ? { ask } : {}),
    ...(pending ? { pending } : {}),
  }
  s.entries.push(entry)
  emit(s, { type: 'entry', entry })
  return entry
}

function appendDelta(s: Session, id: string, delta: string): void {
  const entry = s.entries.find(e => e.id === id)
  if (entry) entry.text += delta
  emit(s, { type: 'delta', id, delta })
}

type BusyHook = (projectId: string, busy: boolean) => void
let busyHook: BusyHook | null = null
/** The worker host records busy transitions on the project row (worker/host.ts). */
export function onSessionBusy(hook: BusyHook | null): void {
  busyHook = hook
}

function setBusy(s: Session, busy: boolean): void {
  if (s.busy === busy) return
  s.busy = busy
  emit(s, {
    type: 'status',
    busy,
    ...(busy ? { activeModel: s.active?.model ?? null } : {}),
  })
  busyHook?.(s.projectId, busy)
}

/** The text of a tool result, whatever shape pi gave it. */
function resultText(result: unknown): string {
  if (typeof result === 'string') return result
  const content = (result as { content?: unknown })?.content
  if (Array.isArray(content))
    return content.map(c => (typeof c?.text === 'string' ? c.text : '')).join('\n')
  return ''
}

function toolLabel(name: string, args: any): string {
  const a = args ?? {}
  const hint = a.url ?? a.out ?? a.file ?? a.path ?? a.pattern ?? a.command ?? a.cmd ?? a.text ?? ''
  const h = String(hint)
  return h ? `${name} · ${h.length > 80 ? `${h.slice(0, 77)}…` : h}` : name
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .join('')
}

function displayPrompt(text: string): string {
  const end = text.indexOf('</studio-context>')
  return end < 0 ? text : text.slice(end + '</studio-context>'.length).trimStart()
}

function entryTime(entry: SessionEntry): number {
  if (entry.type === 'message' && typeof (entry.message as any)?.timestamp === 'number')
    return (entry.message as any).timestamp
  const timestamp = Date.parse(entry.timestamp)
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

export function sessionEntriesFromTranscript(
  manager: SessionManager,
  turns: Map<string, TurnRecord>,
): Entry[] {
  const branch = manager.getBranch()
  const completedTools = new Map<string, boolean>()
  for (const item of branch) {
    if (item.type !== 'message' || item.message.role !== 'toolResult') continue
    completedTools.set((item.message as any).toolCallId, !(item.message as any).isError)
  }

  const entries: Entry[] = []
  for (const [index, item] of branch.entries()) {
    if (item.type !== 'message') continue
    const message = item.message as any
    const at = entryTime(item)
    if (message.role === 'user') {
      const saved = turns.get(item.id)
      entries.push({
        id: saved?.uiId ?? `pi-${item.id}`,
        role: 'user',
        text: saved?.text ?? displayPrompt(contentText(message.content)),
        at,
        sessionEntryId: item.id,
        ...(saved?.checkpointId ? { checkpointId: saved.checkpointId } : {}),
      })
      continue
    }
    if (message.role !== 'assistant') continue
    // A failed call that ended the turn, as the live thread showed it; a
    // failure pi retried past is followed by another assistant message.
    const next = branch.slice(index + 1).find(e => e.type === 'message') as any
    if (message.stopReason === 'error' && next?.message?.role !== 'assistant')
      entries.push({
        id: `${item.id}-error`,
        role: 'assistant',
        text: `⚠ ${message.errorMessage || 'The model call failed'}`,
        at,
      })
    if (!Array.isArray(message.content)) continue
    for (let i = 0; i < message.content.length; i++) {
      const part = message.content[i]
      if (part?.type === 'text' && part.text) {
        entries.push({ id: `${item.id}-text-${i}`, role: 'assistant', text: part.text, at })
      } else if (part?.type === 'thinking' && part.thinking) {
        entries.push({ id: `${item.id}-thinking-${i}`, role: 'thinking', text: part.thinking, at })
      } else if (part?.type === 'toolCall') {
        const args = part.arguments ?? part.input ?? {}
        if (part.name === 'ask_user') {
          const ask = parseAsk(args)
          if (ask)
            entries.push({
              id: `${item.id}-question-${i}`,
              role: 'question',
              text: ask.intro ?? '',
              ask,
              at,
            })
          continue
        }
        const ok = completedTools.get(part.id)
        entries.push({
          id: `${item.id}-tool-${i}`,
          role: 'tool',
          text: toolLabel(part.name, args),
          // Transcript projection only happens for an idle, restored session.
          // A call without a result was interrupted; it cannot still be running.
          tool: { name: part.name, status: ok ? 'done' : 'error' },
          at,
        })
      }
    }
  }
  return entries
}

async function projectCheckpoint(projectId: string): Promise<ProjectCheckpointState> {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { outputs: true, thumbnailUrl: true, lastError: true },
  })
  if (!row) throw new Error('Project not found')
  return row
}

/**
 * The `ask_user` arguments, trusted only as far as their shape. A model that
 * sends a question with no options, or twenty of them, gets what fits: a
 * malformed call must never put an unanswerable card in the thread, so
 * anything that survives here is renderable.
 */
export function parseAsk(args: any): Ask | null {
  const raw = Array.isArray(args?.questions) ? args.questions : []
  const questions: AskQuestion[] = []
  for (const q of raw.slice(0, 3)) {
    const bind = ['videoType', 'durationSeconds'].includes(q?.bind) ? q.bind : undefined
    // A kind may arrive as a bare id: the studio has its words.
    const labelOf = (o: any) =>
      String(o?.label ?? '').trim() ||
      (bind === 'videoType'
        ? (findStyle(o?.id)?.label ?? (o?.id === AUTO_KIND.id ? AUTO_KIND.label : ''))
        : '')
    const options = (Array.isArray(q?.options) ? q.options : [])
      .map((o: any): AskOption => {
        const image = stillPath(o?.image)
        const details = (Array.isArray(o?.details) ? o.details : [])
          .map((d: unknown) =>
            String(d ?? '')
              .trim()
              .slice(0, 140),
          )
          .filter(Boolean)
          .slice(0, 3)
        return {
          id: optionId(o?.id, labelOf(o)),
          label: labelOf(o),
          ...(o?.hint ? { hint: String(o.hint).trim() } : {}),
          ...(image ? { image } : {}),
          ...(details.length ? { details } : {}),
        }
      })
      .filter((o: { id: string; label: string }) => o.id && o.label)
      .slice(0, 6)
    const question = String(q?.question ?? '').trim()
    const offered = bind === 'videoType' ? kindOptions(options) : options
    if (!question || offered.length < 2) continue
    // The first option is the agent's own pick; say so on a single choice.
    if (!q?.multi && offered[0].id !== AUTO_KIND.id)
      offered[0] = { ...offered[0], recommended: true }
    questions.push({
      id: String(q?.id ?? `q${questions.length + 1}`),
      ...(bind ? { bind } : {}),
      question,
      options: offered,
      ...(q?.multi ? { multi: true } : {}),
    })
  }
  if (!questions.length) return null
  const intro = typeof args?.intro === 'string' ? args.intro.trim() : ''
  return { ...(intro ? { intro } : {}), questions }
}

/** A still the card may show: an image inside the workspace, by relative path. */
function stillPath(value: unknown): string | null {
  const rel = typeof value === 'string' ? value.trim().replace(/^\.\//, '') : ''
  if (!/\.(png|jpe?g|webp)$/i.test(rel) || rel.startsWith('/')) return null
  return rel.split('/').some(part => part === '..' || part === '') ? null : rel
}

/**
 * A kind question shows the studio's own words for each kind (styles.ts), not
 * the agent's: the same kind reads the same in every project, in terms of
 * what the user gets. "Let Pitch choose" always closes the list.
 */
function kindOptions(options: AskOption[]): AskOption[] {
  const kinds = options
    .filter(o => o.id !== AUTO_KIND.id)
    .map(o => {
      const style = findStyle(o.id)
      return style ? { id: style.id, label: style.label, hint: style.hint } : o
    })
    .slice(0, 5)
  return [...kinds, { ...AUTO_KIND }]
}

export function resolveAskAnswer(
  projectId: string,
  answer: AskAnswer,
): {
  text: string
  options: Record<string, string | number>
} {
  const s = sessions.get(projectId)
  const entry = s?.entries.find(e => e.id === answer.askEntryId && e.role === 'question' && e.ask)
  if (!entry?.ask) throw new Error('That question is no longer available')
  return resolveAskSelections(entry.ask, answer)
}

export function resolveAskSelections(
  ask: Ask,
  answer: AskAnswer,
): {
  text: string
  options: Record<string, string | number>
} {
  const selected = new Map(answer.selections.map(item => [item.questionId, item]))
  const lines: string[] = []
  const options: Record<string, string | number> = {}
  for (const question of ask.questions) {
    const selection = selected.get(question.id)
    const ids = selection?.optionIds ?? []
    const picks = question.options.filter(option => ids.includes(option.id))
    const customText = String(selection?.customText ?? '')
      .trim()
      .slice(0, 500)
    const count = picks.length + (customText ? 1 : 0)
    if (!count || (!question.multi && count !== 1))
      throw new Error(`Choose an answer for ${question.question}`)
    const labels = [...picks.map(pick => pick.label), ...(customText ? [customText] : [])]
    lines.push(`${question.question} → ${labels.join(', ')}`)
    if (!customText && question.bind === 'videoType' && picks[0].id !== AUTO_KIND.id)
      options.videoType = picks[0].id
    if (!customText && question.bind === 'durationSeconds') {
      const seconds = Number.parseInt(picks[0].label.match(/\d{1,3}/)?.[0] ?? '', 10)
      if (!Number.isFinite(seconds) || seconds < 3 || seconds > 300)
        throw new Error('The selected duration is invalid')
      options.durationSeconds = seconds
    }
  }
  return { text: lines.join('\n'), options }
}

function bindPersistedUserEntry(s: Session): void {
  const ui = s.pendingBindings.shift()
  if (!ui) return
  const item = s.session.sessionManager.getLeafEntry?.() as SessionEntry | undefined
  if (item?.type !== 'message' || item.message.role !== 'user') {
    s.pendingBindings.unshift(ui)
    return
  }
  ui.sessionEntryId = item.id
  ui.pending = undefined
  emit(s, { type: 'update', entry: ui })
  if (!ui.checkpointId) return
  void saveTurnRecord(s.ws.dir, {
    entryId: item.id,
    uiId: ui.id,
    text: ui.text,
    checkpointId: ui.checkpointId,
    at: ui.at,
  }).catch(err =>
    logger.warn({ err, projectId: s.projectId, entryId: item.id }, 'could not save turn history'),
  )
}

function sendSteer(s: Session, pending: PendingSteer): void {
  s.pendingBindings.push(pending.entry)
  void s.session.prompt(pending.full, { streamingBehavior: 'steer' }).catch((error: unknown) => {
    s.pendingBindings = s.pendingBindings.filter(entry => entry !== pending.entry)
    pending.entry.pending = 'cancelled'
    updateEntry(s, pending.entry)
    emit(s, { type: 'error', message: String((error as Error)?.message ?? error) })
  })
}

function onPiEvent(s: Session, ev: any): void {
  switch (ev?.type) {
    case 'agent_start':
      setBusy(s, true)
      for (const pending of s.preStartSteers.splice(0)) {
        pending.entry.checkpointId ??= s.active?.entry.checkpointId
        updateEntry(s, pending.entry)
        sendSteer(s, pending)
      }
      break
    case 'message_start':
      if (ev.message?.role === 'assistant') {
        s.textId = null
        s.thinkingId = null
      }
      break
    case 'message_update': {
      const a = ev.assistantMessageEvent
      if (!a) break
      if (a.type === 'text_delta' && a.delta) {
        if (!s.textId) s.textId = addEntry(s, 'assistant', '').id
        appendDelta(s, s.textId, a.delta)
      } else if (a.type === 'thinking_delta' && a.delta) {
        if (!s.thinkingId) s.thinkingId = addEntry(s, 'thinking', '').id
        appendDelta(s, s.thinkingId, a.delta)
      } else if (a.type === 'text_end') s.textId = null
      else if (a.type === 'thinking_end') s.thinkingId = null
      break
    }
    case 'message_end': {
      const cost = Number(ev.message?.usage?.cost?.total ?? 0)
      if (ev.message?.role === 'assistant' && cost > 0) s.cost += cost
      if (ev.message?.role === 'assistant')
        s.modelError =
          ev.message.stopReason === 'error'
            ? String(ev.message.errorMessage || 'The model call failed')
            : null
      // Pi persists the message immediately after notifying subscribers. Bind
      // the UI entry on the next microtask, when its stable transcript id exists.
      if (ev.message?.role === 'user') queueMicrotask(() => bindPersistedUserEntry(s))
      break
    }
    case 'tool_execution_start':
      if (
        s.active &&
        typeof ev.toolCallId === 'string' &&
        isProvidedSkillRead(ev.toolName, ev.args, s.ws.dir, s.providedSkillFiles)
      )
        s.pendingSkillReads.set(ev.toolCallId, s.active.turn)
      // ask_user is not a step the user watches — it IS the message. Draw it
      // as the question card instead of a "running" log line.
      if (ev.toolName === 'ask_user') {
        const ask = parseAsk(ev.args)
        if (ask) {
          addEntry(s, 'question', ask.intro ?? '', undefined, ask)
          break
        }
      }
      addEntry(s, 'tool', toolLabel(ev.toolName, ev.args), {
        name: ev.toolName,
        status: 'running',
        callId: ev.toolCallId,
      })
      emit(s, { type: 'tool', name: ev.toolName, args: ev.args ?? {} })
      break
    case 'tool_execution_update': {
      if (typeof ev.toolCallId !== 'string') break
      const raw = (ev.partialResult?.content ?? [])
        .filter((part: any) => part.type === 'text')
        .map((part: any) => String(part.text ?? ''))
        .join('\n')
        .slice(-8192)
      const progress = [...raw.matchAll(/^\[pitch-progress\] (.+)$/gm)].at(-1)?.[1]?.slice(0, 180)
      const entry = s.entries.find(
        e => e.tool?.callId === ev.toolCallId && e.tool?.status === 'running',
      )
      if (progress && entry?.tool && entry.tool.progress !== progress) {
        entry.tool.progress = progress
        emit(s, { type: 'update', entry })
      }
      break
    }
    case 'tool_execution_end': {
      const skillTurn = s.pendingSkillReads.get(ev.toolCallId)
      s.pendingSkillReads.delete(ev.toolCallId)
      if (!ev.isError && skillTurn !== undefined && s.active?.turn === skillTurn)
        s.active.usedProvidedSkill = true
      const entry = [...s.entries]
        .reverse()
        .find(
          e =>
            e.role === 'tool' &&
            e.tool?.status === 'running' &&
            (e.tool.callId ? e.tool.callId === ev.toolCallId : e.tool.name === ev.toolName),
        )
      if (entry?.tool) {
        entry.tool.status = ev.isError ? 'error' : 'done'
        delete entry.tool.progress
        emit(s, { type: 'update', entry })
      }
      break
    }
  }
}

/**
 * Resume a saved transcript, or start a new one.
 *
 * Best-effort by design. The transcript lives OUTSIDE the workspace, under
 * ~/.pi/agent/sessions, so it can go missing on its own — a cleared volume, a
 * pruned container, a project deleted from under it — and `existsSync` only
 * says it was there a moment ago. Losing the history is a far smaller problem
 * than a project that can never take another turn, so anything that goes wrong
 * here falls back to a fresh session and forgets the path.
 */
export async function resumeOrCreate(
  projectId: string,
  savedPath: string | null,
  dir: string,
  deps: {
    open: (file: string, dir: string) => unknown
    create: (dir: string) => unknown
    exists: (file: string) => boolean
    forget: (projectId: string) => Promise<void>
  },
): Promise<unknown> {
  if (savedPath) {
    try {
      if (deps.exists(savedPath)) return deps.open(savedPath, dir)
    } catch (err) {
      logger.warn(
        { err, projectId, savedPath },
        'could not resume the saved session; starting a fresh one',
      )
    }
    await deps.forget(projectId)
  }
  return deps.create(dir)
}

/** Drop a sessionFile the row still names but the disk no longer has. */
async function forgetSessionFile(projectId: string): Promise<void> {
  await prisma.project
    .update({ where: { id: projectId }, data: { sessionFile: null } })
    .catch(err => logger.warn({ err, projectId }, 'could not clear the stale session file'))
}

async function persistSessionFile(projectId: string, sessionFile: string): Promise<void> {
  await prisma.project
    .update({ where: { id: projectId }, data: { sessionFile } })
    .catch(err => logger.warn({ err, projectId }, 'could not persist session file'))
}

export interface OpenSessionOptions {
  projectId: string
  ws: Workspace
  agent: Agent
  sessionFile: string | null
  prompt?: string
  uploads?: string[]
  /** A `provider/id` the user picked in the composer; falls back to STUDIO_MODEL. */
  model?: string
}

function watchSession(s: Session): void {
  watchWorkspace(
    s.ws.dir,
    {
      relevant: s.agent.relevant,
      assets: ASSET_PATH,
      probe: async dir => {
        const d = await s.agent.describe({ ...s.ws, dir })
        return { ok: !d.error, error: d.error ?? null, description: d }
      },
    },
    ev => emit(s, ev),
  )
}

/**
 * Get (or lazily create) the pi session bound to a project.
 *
 * One toolkit, fixed for the life of the session: the sandboxed file tools
 * and the question card, with `pitch` on the shell's PATH. A deck that turns
 * into a film needs no rebuild and no widening — every capability was already
 * one command away.
 */
export async function getSession(opts: OpenSessionOptions): Promise<Session> {
  const existing = sessions.get(opts.projectId)
  if (existing) return existing
  const pending = pendingCreates.get(opts.projectId)
  if (pending) return pending

  const create = (async () => {
    await initStudio()
    const { ws, agent } = opts
    mkdirSync(ws.dir, { recursive: true })

    const prompt = await agent.systemPrompt()
    const sessionManager = (await resumeOrCreate(opts.projectId, opts.sessionFile, ws.dir, {
      open: (file, dir) => SessionManager.open(file, undefined, dir),
      create: dir => SessionManager.create(dir),
      exists: existsSync,
      forget: forgetSessionFile,
    })) as SessionManager

    const extensions = [...(agent.sandbox ? [SANDBOX_EXTENSION] : []), ...EXTENSIONS]
    const allowedExt = new Set(extensions.map(p => path.resolve(p)))
    const resourceLoader = new DefaultResourceLoader({
      cwd: ws.dir,
      agentDir: AGENT_DIR,
      additionalExtensionPaths: extensions,
      additionalSkillPaths: await agent.skills(),
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true,
      extensionsOverride: (base: any) => ({
        ...base,
        extensions: base.extensions.filter((e: any) =>
          allowedExt.has(path.resolve(e.resolvedPath ?? e.path)),
        ),
      }),
      appendSystemPromptOverride: () => (prompt ? [prompt] : []),
    })
    await resourceLoader.reload()
    const skillsRoot = canonicalPath(SKILLS_DIR, ws.dir)
    const providedSkillFiles = new Set<string>()
    for (const skill of resourceLoader.getSkills?.()?.skills ?? []) {
      const file = canonicalPath(skill.filePath, ws.dir)
      if (skillsRoot && file?.startsWith(`${skillsRoot}${path.sep}`)) providedSkillFiles.add(file)
    }
    const ext: any = resourceLoader.getExtensions?.()
    for (const e of ext?.errors ?? [])
      logger.warn({ err: e.error, path: e.path }, 'extension failed to load')

    const extensionTools: string[] = (ext?.extensions ?? []).flatMap((e: any) => [
      ...(e.tools?.keys?.() ?? []),
    ])
    const { session } = await createAgentSession({
      cwd: ws.dir,
      modelRuntime,
      ...resolveModel(opts.model),
      sessionManager,
      resourceLoader,
      // Sandboxed: pi's built-ins run inside the VM, so they stay as they are.
      // Unsandboxed would mean host file access, so the allowlist applies.
      ...(agent.sandbox
        ? {}
        : { noTools: 'builtin' as const, tools: [...agent.builtinTools, ...extensionTools] }),
    })

    const turns = await readTurnHistory(ws.dir)
    const restoredEntries = sessionEntriesFromTranscript(session.sessionManager, turns)
    const s: Session = {
      projectId: opts.projectId,
      ws,
      agent,
      session,
      entries: restoredEntries,
      busy: false,
      counter: restoredEntries.length,
      textId: null,
      thinkingId: null,
      turn: 0,
      cost: 0,
      modelError: null,
      queue: [],
      active: null,
      pendingBindings: [],
      preStartSteers: [],
      stopping: false,
      providedSkillFiles,
      pendingSkillReads: new Map(),
    }
    session.subscribe((ev: any) => onPiEvent(s, ev))
    sessions.set(opts.projectId, s)
    watchSession(s)

    if (typeof session.sessionFile === 'string')
      await persistSessionFile(opts.projectId, session.sessionFile)
    logger.info(
      { projectId: opts.projectId, workspace: ws.internal, resumed: Boolean(opts.sessionFile) },
      'session ready',
    )
    return s
  })()

  pendingCreates.set(opts.projectId, create)
  try {
    return await create
  } finally {
    pendingCreates.delete(opts.projectId)
  }
}

export function peekSession(projectId: string): Session | undefined {
  return sessions.get(projectId)
}

export const STUDIO_DEFAULT_MODEL = MODEL_SPEC

/**
 * What the composer's model picker may offer: only the allowlisted specs
 * the runtime can actually run. A provider without a key is dropped so a
 * turn cannot pick something that would fail.
 */
export async function listStudioModels(userId?: string): Promise<PickerModel[]> {
  await initStudio()
  const profile = userId
    ? await prisma.userProfile
        ?.findUnique?.({
          where: { id: userId },
          select: { gptEnabled: true },
        })
        ?.catch?.(() => null)
    : null
  const available = new Map<string, any>()
  for (const m of await modelRuntime.getAvailable()) {
    const spec = `${m.provider}/${m.id}`
    if (!available.has(spec)) available.set(spec, m)
  }
  for (const spec of ALLOWED_SPECS) {
    if (available.has(spec)) continue
    const { provider, id } = parseModelSpec(spec)
    const model = modelRuntime.getModel(provider, id)
    if (model && providerIsRunnable(provider)) available.set(spec, model)
    else
      warnConfigOnce({ spec }, 'STUDIO_MODELS entry is not runnable here — hidden from the picker')
  }
  return assembleStudioPicker(available.values(), {
    defaultSpec: MODEL_SPEC,
    specs: ALLOWED_SPECS,
    gptEnabled: profile?.gptEnabled === true,
  })
}

/**
 * The token prices the runtime bills each model at (the same table that turns
 * a message's usage into its cost), for quoting estimates. Every allowlisted
 * model is included whether or not this deployment can run it.
 */
export async function studioModelPrices(): Promise<Record<string, TokenPrice | undefined>> {
  await initStudio()
  return Object.fromEntries(ALLOWED_SPECS.map(spec => [spec, studioModelPrice(spec)]))
}

/** One model's token price; undefined before the runtime is up or when unknown. */
export function studioModelPrice(spec: string): TokenPrice | undefined {
  if (!modelRuntime) return undefined
  const { provider, id } = parseModelSpec(spec)
  return tokenPriceOf(modelRuntime.getModel(provider, id))
}

/**
 * Model spend since the last time this was called, in USD. Reading it zeroes
 * the counter so a turn is billed exactly once (projects/usage.ts).
 */
export function takeModelCost(projectId: string): number {
  const s = sessions.get(projectId)
  if (!s) return 0
  const cost = s.cost
  s.cost = 0
  return cost
}

/** Model spend accrued without draining it, for live affordability checks. */
export function peekModelCost(projectId: string): number {
  return sessions.get(projectId)?.cost ?? 0
}

export function activeTurnUsesProvidedSkill(projectId: string, turn: number): boolean {
  const active = sessions.get(projectId)?.active
  return active?.turn === turn && active.usedProvidedSkill
}

export function listBusy(): Set<string> {
  return new Set([...sessions.values()].filter(s => s.busy).map(s => s.projectId))
}

/**
 * Switch a live session to the model the user picked. pi's setModel validates
 * auth itself and records the change in the transcript, so a resumed session
 * keeps the choice.
 */
async function applyModel(s: Session, spec: string): Promise<void> {
  const { model } = resolveModel(spec)
  if (!model) return
  const current = s.session.model
  if (current && current.provider === model.provider && current.id === model.id) return
  await s.session.setModel(model)
  logger.info({ projectId: s.projectId, model: spec }, 'session model switched')
}

export type PromptDelivery = 'queue' | 'steer'

export interface PromptSessionResult {
  session: Session
  turn: number
  entryId: string
  delivery: 'started' | 'queued' | 'steered'
}

function updateEntry(s: Session, entry: Entry): void {
  emit(s, { type: 'update', entry })
}

async function runPrompt(s: Session, request: PendingPrompt): Promise<void> {
  s.active = request
  // setBusy() runs just before runPrompt(), so publish the model once the
  // active request is attached. This also updates queued turns as they start.
  emit(s, { type: 'status', busy: true, activeModel: request.model ?? null })
  let failed = false
  try {
    if (request.model) await applyModel(s, request.model)
    request.entry.checkpointId ??= await createWorkspaceCheckpoint(
      s.ws.dir,
      await projectCheckpoint(s.projectId),
    )
    request.entry.pending = undefined
    updateEntry(s, request.entry)
    if (s.stopping) return
    const context =
      typeof request.context === 'function' ? await request.context() : request.context
    const full = context
      ? `<studio-context>\n${context}\n</studio-context>\n\n${request.text}`
      : request.text
    s.pendingBindings.push(request.entry)
    s.modelError = null
    await s.session.prompt(full)
    if (s.modelError) {
      logger.error({ projectId: s.projectId, error: s.modelError }, 'model call failed')
      emit(s, { type: 'error', message: s.modelError })
      s.modelError = null
    }
  } catch (err) {
    failed = true
    s.pendingBindings = s.pendingBindings.filter(entry => entry !== request.entry)
    request.entry.pending = 'cancelled'
    updateEntry(s, request.entry)
    logger.error({ err, projectId: s.projectId }, 'prompt failed')
    const missing = (err as NodeJS.ErrnoException)?.code === 'ENOENT'
    if (missing) {
      sessions.delete(s.projectId)
      await forgetSessionFile(s.projectId)
      s.stopping = true
    }
    emit(s, {
      type: 'error',
      message: missing
        ? 'This project lost its conversation history. Send that again and it will start a new one — the workspace and its files are untouched.'
        : String((err as Error)?.message ?? err),
    })
  } finally {
    const aborted = s.stopping
    s.active = null
    const cancelled = aborted ? s.queue.splice(0) : []
    for (const queued of cancelled) {
      queued.entry.pending = 'cancelled'
      updateEntry(s, queued.entry)
    }
    const next = aborted ? undefined : s.queue.shift()
    if (!next) {
      s.stopping = false
      setBusy(s, false)
    }
    const modelUsd = s.cost
    s.cost = 0
    emit(s, {
      type: 'idle',
      turn: request.turn,
      cost: modelUsd,
      usedProvidedSkill: request.usedProvidedSkill,
      busy: Boolean(next),
      ...(failed ? { failed: true } : {}),
      ...(aborted ? { aborted: true } : {}),
    })
    for (const queued of cancelled)
      emit(s, { type: 'idle', turn: queued.turn, cost: 0, busy: false, aborted: true })
    if (next) void runPrompt(s, next)
  }
}

/** Accept a prompt, queue it behind the active turn, or steer the active run. */
export async function promptSession(
  opts: OpenSessionOptions,
  text: string,
  context?: string | (() => Promise<string>),
  delivery: PromptDelivery = 'queue',
  displayText = text,
): Promise<PromptSessionResult> {
  const s = await getSession(opts)
  if (s.busy) {
    if (delivery === 'steer') {
      const entry = addEntry(s, 'user', displayText, undefined, undefined, 'steering')
      try {
        if (opts.model) await applyModel(s, opts.model)
        const resolved = typeof context === 'function' ? await context() : context
        const full = resolved ? `<studio-context>\n${resolved}\n</studio-context>\n\n${text}` : text
        if (s.session.isStreaming) {
          entry.checkpointId = s.active?.entry.checkpointId
          updateEntry(s, entry)
          sendSteer(s, { entry, full })
          return {
            session: s,
            turn: s.active?.turn ?? s.turn,
            entryId: entry.id,
            delivery: 'steered',
          }
        }
        if (s.busy && s.active) {
          entry.checkpointId = s.active.entry.checkpointId
          updateEntry(s, entry)
          s.preStartSteers.push({ entry, full })
          return { session: s, turn: s.active.turn, entryId: entry.id, delivery: 'steered' }
        }
        entry.pending = 'queued'
        updateEntry(s, entry)
        const request = {
          text,
          context,
          model: opts.model,
          entry,
          turn: ++s.turn,
          usedProvidedSkill: false,
        }
        if (s.busy) s.queue.unshift(request)
        else {
          setBusy(s, true)
          void runPrompt(s, request)
        }
        return { session: s, turn: request.turn, entryId: entry.id, delivery: 'queued' }
      } catch (error) {
        entry.pending = 'cancelled'
        updateEntry(s, entry)
        throw error
      }
    }
    const entry = addEntry(s, 'user', displayText, undefined, undefined, 'queued')
    const request = {
      text,
      context,
      model: opts.model,
      entry,
      turn: ++s.turn,
      usedProvidedSkill: false,
    }
    s.queue.push(request)
    return { session: s, turn: request.turn, entryId: entry.id, delivery: 'queued' }
  }

  const entry = addEntry(s, 'user', displayText)
  setBusy(s, true)
  const request = {
    text,
    context,
    model: opts.model,
    entry,
    turn: ++s.turn,
    usedProvidedSkill: false,
  }
  void runPrompt(s, request)
  return { session: s, turn: request.turn, entryId: entry.id, delivery: 'started' }
}

/** Promote an already queued user message into the active model run. */
export async function steerQueuedPrompt(projectId: string, entryId: string): Promise<boolean> {
  const s = sessions.get(projectId)
  if (!s?.busy || s.stopping) return false
  const request = s.queue.find(request => request.entry.id === entryId)
  if (!request) return false
  // Resolve before removing it: a failed context lookup must not lose the
  // message, and the active run may finish while the lookup is in flight.
  const context = typeof request.context === 'function' ? await request.context() : request.context
  const index = s.queue.indexOf(request)
  if (!s.busy || s.stopping) return false
  if (index < 0) return false
  s.queue.splice(index, 1)
  request.entry.pending = 'steering'
  request.entry.checkpointId ??= s.active?.entry.checkpointId
  updateEntry(s, request.entry)
  const full = context
    ? `<studio-context>\n${context}\n</studio-context>\n\n${request.text}`
    : request.text
  if (s.session.isStreaming) sendSteer(s, { entry: request.entry, full })
  else s.preStartSteers.push({ entry: request.entry, full })
  return true
}

export async function stopSession(projectId: string): Promise<boolean> {
  const s = sessions.get(projectId)
  if (!s?.busy) return false
  s.stopping = true
  abortHostActions(s.ws.internal)
  for (const request of s.queue) {
    request.entry.pending = 'cancelled'
    updateEntry(s, request.entry)
  }
  for (const pending of s.preStartSteers.splice(0)) {
    pending.entry.pending = 'cancelled'
    updateEntry(s, pending.entry)
  }
  const activeBinding = s.active?.entry
  const keep: Entry[] = []
  for (const entry of s.pendingBindings) {
    if (entry === activeBinding) keep.push(entry)
    else if (!entry.sessionEntryId) {
      entry.pending = 'cancelled'
      updateEntry(s, entry)
    }
  }
  s.pendingBindings = keep
  s.session.clearQueue?.()
  await s.session.abort()
  return true
}

export async function getSessionEntries(opts: OpenSessionOptions): Promise<Entry[]> {
  return (await getSession(opts)).entries
}

export interface RollbackResult {
  text: string
  entries: Entry[]
  project: ProjectCheckpointState
}

/** Branch before a user message and restore the workspace captured before it ran. */
export async function rollbackSession(
  opts: OpenSessionOptions,
  sessionEntryId: string,
): Promise<RollbackResult> {
  const s = await getSession(opts)
  if (s.busy) {
    const error: any = new Error('Stop the agent before rolling back the conversation')
    error.code = 'BUSY'
    throw error
  }
  const target = s.session.sessionManager.getEntry(sessionEntryId) as SessionEntry | undefined
  const active = (s.session.sessionManager.getBranch() as SessionEntry[]).some(
    entry => entry.id === sessionEntryId,
  )
  if (!active || target?.type !== 'message' || target.message.role !== 'user') {
    const error: any = new Error('That message is no longer on the active conversation branch')
    error.status = 409
    throw error
  }
  const turns = await readTurnHistory(s.ws.dir)
  const saved = turns.get(sessionEntryId)
  const live = s.entries.find(entry => entry.sessionEntryId === sessionEntryId)
  const checkpointId = saved?.checkpointId ?? live?.checkpointId
  if (!checkpointId) {
    const error: any = new Error('This message predates workspace history and cannot be restored')
    error.status = 409
    throw error
  }

  const oldLeaf = s.session.sessionManager.getLeafId() as string | null
  await s.session.navigateTree(sessionEntryId, { summarize: false })
  // SessionManager stores a tree, but its leaf pointer is otherwise only in
  // memory until another message is appended. Persist the rollback branch so
  // a refresh or server restart before resend cannot reopen the abandoned path.
  s.session.sessionManager.appendCustomEntry('pitch-rollback', { sessionEntryId })
  unwatchWorkspace(s.ws.dir)
  let project: ProjectCheckpointState
  try {
    project = await restoreWorkspaceCheckpoint(s.ws.dir, checkpointId)
  } catch (error) {
    if (oldLeaf) s.session.sessionManager.branch(oldLeaf)
    else s.session.sessionManager.resetLeaf()
    s.session.sessionManager.appendCustomEntry('pitch-rollback-reverted', { sessionEntryId })
    s.session.agent.state.messages = s.session.sessionManager.buildSessionContext().messages
    watchSession(s)
    throw error
  }
  watchSession(s)

  s.entries = sessionEntriesFromTranscript(s.session.sessionManager, turns)
  s.counter = s.entries.length
  emit(s, { type: 'reset', entries: s.entries })
  try {
    const description = await s.agent.describe(s.ws)
    emit(s, {
      type: 'preview',
      ok: !description.error,
      error: description.error ?? null,
      files: [],
      description,
    })
  } catch (error) {
    logger.warn({ error, projectId: s.projectId }, 'could not describe restored workspace')
  }
  return {
    text: saved?.text ?? live?.text ?? displayPrompt(contentText(target.message.content)),
    entries: s.entries,
    project,
  }
}

/** Abort, drop the in-memory session and its pi session file, unwatch the workspace. */
export async function closeSession(
  projectId: string,
  sessionFile: string | null,
  dir: string,
): Promise<void> {
  unwatchWorkspace(dir)
  const s = sessions.get(projectId)
  if (s) {
    s.stopping = true
    s.queue.length = 0
    s.preStartSteers.length = 0
    await s.session.abort().catch(() => {})
    sessions.delete(projectId)
    try {
      await s.session.dispose?.()
    } catch {
      // best-effort
    }
  }
  if (sessionFile) await rm(sessionFile, { force: true }).catch(() => {})
}

export async function closeStudio(): Promise<void> {
  await Promise.all(
    [...sessions.values()].map(async s => {
      s.stopping = true
      s.queue.length = 0
      s.preStartSteers.length = 0
      if (s.busy) await s.session.abort().catch(() => {})
      unwatchWorkspace(s.ws.dir)
    }),
  )
}
