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
import { existsSync, mkdirSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import { prisma } from '@saas/db'
import { createLogger } from '@saas/shared'
import {
  activeToolNames,
  EXTENSIONS,
  type Family,
  familiesFor,
  familyOfTool,
  type ProjectEvidence,
  type SkillFamilies,
  skillFamilies,
  skillNamed,
  type ToolsByExtension,
} from '../agent/toolkit.js'
import type { getAgent } from '../flows/index.js'
import { ASSET_PATH } from '../projects/assets.js'
import { emitProjectEvent, type StudioEvent } from './events.js'
import {
  assembleStudioPicker,
  DEFAULT_STUDIO_MODEL,
  parseModelSpec,
  studioModelSpecs,
} from './model-picker.js'
import { PI_DIR, PI_EXTENSIONS_DIR, type Workspace } from './paths.js'
import { unwatchWorkspace, watchWorkspace } from './watch.js'

const logger = createLogger('studio:session')

export type EntryRole = 'user' | 'assistant' | 'thinking' | 'tool' | 'question'

/** One question the studio draws as clickable options (see .pi/extensions/ask-tools.ts). */
export interface AskQuestion {
  id: string
  question: string
  options: { label: string; hint?: string }[]
  multi?: boolean
}

export interface Ask {
  intro?: string
  questions: AskQuestion[]
}

export interface Entry {
  id: string
  role: EntryRole
  text: string
  tool?: { name: string; status: 'running' | 'done' | 'error' }
  /** Present on `question` entries only: what the buttons say. */
  ask?: Ask
  at: number
}

type Agent = ReturnType<typeof getAgent>

export interface Session {
  projectId: string
  ws: Workspace
  agent: Agent
  /** Tool families shown so far; they only ever grow, from evidence. */
  families: Set<Family>
  /** Skills whose SKILL.md the agent has read; each brings its declared families. */
  skillsRead: Set<string>
  /** What every skill declares it needs (`tools:` in its frontmatter). */
  declared: SkillFamilies
  /** Every tool pi loaded, by the extension file that registered it. */
  toolsByExtension: ToolsByExtension
  /** The sandboxed file tools, active on every turn. */
  alwaysOn: string[]
  session: any
  entries: Entry[]
  busy: boolean
  counter: number
  textId: string | null
  thinkingId: string | null
  turn: number
  cost: number
}

const sessions = new Map<string, Session>()
const pendingCreates = new Map<string, Promise<Session>>()

let modelRuntime: any
let initPromise: Promise<void> | null = null

const AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent')
const SANDBOX_EXTENSION = path.join(PI_EXTENSIONS_DIR, 'bwrap-sandbox.ts')
// Must be an id the pi runtime actually has: an unknown one is a warning, not
// an error, and the studio silently falls back to pi's own default — which
// carries no Gemini key here, so the first turn never runs and the project
// sits at "working" forever. Check against the runtime before changing it.
const MODEL_SPEC = process.env.STUDIO_MODEL || DEFAULT_STUDIO_MODEL
const ALLOWED_SPECS = studioModelSpecs()
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

function openRouterApiKey(): string | undefined {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  return key || undefined
}

function googleApiKey(): string | undefined {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)?.trim()
  return key || undefined
}

function providerIsRunnable(provider: string): boolean {
  if (modelRuntime.hasConfiguredAuth(provider)) return true
  if (provider === 'openrouter') return Boolean(openRouterApiKey())
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
        logger.warn(
          { allowed: ALLOWED_SPECS },
          'GEMINI_API_KEY is not set — Google models will be hidden from the picker',
        )
      }
      const orKey = openRouterApiKey()
      if (orKey) {
        try {
          await modelRuntime.setRuntimeApiKey('openrouter', orKey)
        } catch (err) {
          logger.warn({ err }, 'could not apply OPENROUTER_API_KEY to the model runtime')
        }
      } else if (ALLOWED_SPECS.some(s => parseModelSpec(s).provider === 'openrouter')) {
        logger.warn(
          { allowed: ALLOWED_SPECS },
          'OPENROUTER_API_KEY is not set — OpenRouter models will be hidden from the picker',
        )
      }
      const m = resolveModel()
      logger.info(
        {
          model: m.model ? `${m.model.provider}/${m.model.id}` : '(pi default)',
          allowed: ALLOWED_SPECS,
          google: Boolean(gKey),
          openrouter: Boolean(orKey),
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
): Entry {
  const entry: Entry = {
    id: `e${++s.counter}`,
    role,
    text,
    at: Date.now(),
    ...(tool ? { tool } : {}),
    ...(ask ? { ask } : {}),
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

function setBusy(s: Session, busy: boolean): void {
  if (s.busy === busy) return
  s.busy = busy
  emit(s, { type: 'status', busy })
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
    const options = (Array.isArray(q?.options) ? q.options : [])
      .map((o: any) => ({
        label: String(o?.label ?? '').trim(),
        ...(o?.hint ? { hint: String(o.hint).trim() } : {}),
      }))
      .filter((o: { label: string }) => o.label)
      .slice(0, 6)
    const question = String(q?.question ?? '').trim()
    if (!question || options.length < 2) continue
    questions.push({
      id: String(q?.id ?? `q${questions.length + 1}`),
      question,
      options,
      ...(q?.multi ? { multi: true } : {}),
    })
  }
  if (!questions.length) return null
  const intro = typeof args?.intro === 'string' ? args.intro.trim() : ''
  return { ...(intro ? { intro } : {}), questions }
}

function onPiEvent(s: Session, ev: any): void {
  switch (ev?.type) {
    case 'agent_start':
      setBusy(s, true)
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
      break
    }
    case 'tool_execution_start':
      // ask_user is not a step the user watches — it IS the message. Draw it
      // as the question card instead of a "running" log line.
      if (ev.toolName === 'ask_user') {
        const ask = parseAsk(ev.args)
        if (ask) {
          addEntry(s, 'question', ask.intro ?? '', undefined, ask)
          break
        }
      }
      addEntry(s, 'tool', toolLabel(ev.toolName, ev.args), { name: ev.toolName, status: 'running' })
      emit(s, { type: 'tool', name: ev.toolName, args: ev.args ?? {} })
      if (ev.toolName === 'read' || ev.toolName === 'bash') onSkillRead(s, ev.args)
      break
    case 'tool_execution_end': {
      if (ev.isError && /^Tool \S+ not found/.test(resultText(ev.result)))
        onHiddenTool(s, ev.toolName)
      const entry = [...s.entries]
        .reverse()
        .find(e => e.role === 'tool' && e.tool?.status === 'running' && e.tool.name === ev.toolName)
      if (entry?.tool) {
        entry.tool.status = ev.isError ? 'error' : 'done'
        emit(s, { type: 'update', entry })
      }
      break
    }
    case 'agent_end':
    case 'agent_settled':
      if (s.busy) {
        setBusy(s, false)
        emit(s, { type: 'idle', turn: s.turn, cost: s.cost })
      }
      break
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
  /** The user's words this turn, so a new need widens the toolkit. */
  prompt?: string
  uploads?: string[]
  /** A `provider/id` the user picked in the composer; falls back to STUDIO_MODEL. */
  model?: string
}

/**
 * What this project's workspace shows, for familiesFor().
 *
 * A shallow listing plus the two nested paths the classifier looks at; the
 * agent's own files are what say a deck has become a film.
 */
async function evidenceFor(s: Session, opts: OpenSessionOptions): Promise<ProjectEvidence> {
  const files: string[] = []
  for (const name of await readdir(s.ws.dir).catch(() => [] as string[])) {
    files.push(name)
    if (name === 'recording' || name === 'uploads' || name === 'build') {
      for (const inner of await readdir(path.join(s.ws.dir, name)).catch(() => [] as string[]))
        files.push(`${name}/${inner}`)
    }
  }
  const skills = new Set(s.skillsRead)
  try {
    const project = JSON.parse(await readFile(path.join(s.ws.dir, 'project.json'), 'utf8'))
    if (typeof project?.options?.skill === 'string') skills.add(project.options.skill)
  } catch {
    // no project.json yet — the files and the skills the agent reads decide
  }
  return { files, uploads: opts.uploads, skills: [...skills], declared: s.declared }
}

/**
 * Get (or lazily create) the pi session bound to a project.
 *
 * Every extension is loaded once; which tools the model is SHOWN is decided
 * per turn (see activateTools), so a session never has to be rebuilt when a
 * deck turns into a film — the toolkit simply widens before the next prompt.
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
    const ext: any = resourceLoader.getExtensions?.()
    for (const e of ext?.errors ?? [])
      logger.warn({ err: e.error, path: e.path }, 'extension failed to load')

    const toolsByExtension = new Map<string, string[]>()
    for (const e of ext?.extensions ?? []) {
      toolsByExtension.set(path.resolve(e.resolvedPath ?? e.path), [...(e.tools?.keys?.() ?? [])])
    }
    const extensionTools: string[] = [...toolsByExtension.values()].flat()
    const alwaysOn = agent.sandbox
      ? (toolsByExtension.get(path.resolve(SANDBOX_EXTENSION)) ?? [])
      : [...agent.builtinTools]
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

    const s: Session = {
      projectId: opts.projectId,
      ws,
      agent,
      families: new Set<Family>(),
      skillsRead: new Set<string>(),
      declared: await skillFamilies(),
      toolsByExtension,
      alwaysOn,
      session,
      entries: [],
      busy: false,
      counter: 0,
      textId: null,
      thinkingId: null,
      turn: 0,
      cost: 0,
    }
    session.subscribe((ev: any) => onPiEvent(s, ev))
    await activateTools(s, opts)
    sessions.set(opts.projectId, s)
    watchWorkspace(
      ws.dir,
      {
        relevant: agent.relevant,
        assets: ASSET_PATH,
        probe: async dir => {
          const d = await agent.describe({ ...ws, dir })
          return { ok: !d.error, error: d.error ?? null, description: d }
        },
      },
      ev => emit(s, ev),
    )

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
export async function listStudioModels(): Promise<{ spec: string; label: string }[]> {
  await initStudio()
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
    else logger.warn({ spec }, 'STUDIO_MODELS entry is not runnable here — hidden from the picker')
  }
  return assembleStudioPicker(available.values(), {
    defaultSpec: MODEL_SPEC,
    specs: ALLOWED_SPECS,
  })
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

export function listBusy(): Set<string> {
  return new Set([...sessions.values()].filter(s => s.busy).map(s => s.projectId))
}

/**
 * Show the model the tools this turn needs.
 *
 * The families come from the evidence — the workspace's files, the uploads,
 * the skills — and accumulate: once a project has been a deck it can always
 * edit the deck. pi rebuilds the tool list before every model call, so a
 * family added mid-turn is there for the agent's next step.
 */
async function activateTools(s: Session, opts: OpenSessionOptions): Promise<void> {
  widen(s, familiesFor(await evidenceFor(s, opts)), 'turn')
}

function widen(s: Session, needed: Iterable<Family>, why: string): void {
  const added = [...needed].filter(f => !s.families.has(f))
  for (const f of added) s.families.add(f)
  if (!added.length && s.turn > 0) return
  const names = activeToolNames(s.families, s.toolsByExtension, s.alwaysOn)
  s.session.setActiveToolsByName(names)
  logger.info(
    { projectId: s.projectId, families: [...s.families], added, tools: names.length, why },
    'session toolkit',
  )
}

/**
 * The agent has read a skill: it has decided what this project is, and the
 * skill's frontmatter says which tools that takes. Widen before its next step.
 */
function onSkillRead(s: Session, args: unknown): void {
  const skill = skillNamed(args)
  if (!skill || s.skillsRead.has(skill)) return
  s.skillsRead.add(skill)
  widen(s, s.declared.get(skill) ?? [], `read skill ${skill}`)
}

/**
 * The agent called a tool it was not shown. If the tool exists, its family
 * is what the turn needs: widen, and pi's "not found" result is followed by
 * a model call that has it — the retry is the agent's own next move.
 */
function onHiddenTool(s: Session, toolName: string): void {
  const family = familyOfTool(toolName, s.toolsByExtension)
  if (family && !s.families.has(family)) widen(s, [family], `hidden tool ${toolName}`)
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

/** Fire-and-forget prompt; `context` rides along in a tagged block. */
export async function promptSession(
  opts: OpenSessionOptions,
  text: string,
  context?: string,
): Promise<Session> {
  const s = await getSession(opts)
  if (opts.model) await applyModel(s, opts.model)
  if (s.busy) {
    const err: any = new Error('The agent is still working on this project')
    err.code = 'BUSY'
    throw err
  }
  await activateTools(s, opts)
  addEntry(s, 'user', text)
  setBusy(s, true)
  s.turn += 1
  const full = context ? `<studio-context>\n${context}\n</studio-context>\n\n${text}` : text
  void s.session.prompt(full).catch(async (err: unknown) => {
    logger.error({ err, projectId: s.projectId }, 'prompt failed')
    // A missing transcript poisons the cached session: every later turn throws
    // the same ENOENT until the process restarts. Drop it so the next attempt
    // builds a fresh one, and say so in words the user can act on.
    const missing = (err as NodeJS.ErrnoException)?.code === 'ENOENT'
    if (missing) {
      sessions.delete(s.projectId)
      await forgetSessionFile(s.projectId)
    }
    emit(s, {
      type: 'error',
      message: missing
        ? 'This project lost its conversation history. Send that again and it will start a new one — the workspace and its files are untouched.'
        : String((err as Error)?.message ?? err),
    })
    setBusy(s, false)
    emit(s, { type: 'idle', turn: s.turn, cost: s.cost, failed: true })
  })
  return s
}

export async function stopSession(projectId: string): Promise<boolean> {
  const s = sessions.get(projectId)
  if (!s?.busy) return false
  await s.session.abort()
  setBusy(s, false)
  emit(s, { type: 'idle', turn: s.turn, cost: s.cost, aborted: true })
  return true
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
      if (s.busy) await s.session.abort().catch(() => {})
      unwatchWorkspace(s.ws.dir)
    }),
  )
}
