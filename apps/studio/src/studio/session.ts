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
import { rm } from 'node:fs/promises'
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
import type { getAgent } from '../flows/index.js'
import { emitProjectEvent, type StudioEvent } from './events.js'
import { PI_EXTENSIONS_DIR, type Workspace } from './paths.js'
import { unwatchWorkspace, watchWorkspace } from './watch.js'

const logger = createLogger('studio:session')

export type EntryRole = 'user' | 'assistant' | 'thinking' | 'tool'

export interface Entry {
  id: string
  role: EntryRole
  text: string
  tool?: { name: string; status: 'running' | 'done' | 'error' }
  at: number
}

type Agent = ReturnType<typeof getAgent>

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
}

const sessions = new Map<string, Session>()
const pendingCreates = new Map<string, Promise<Session>>()

let modelRuntime: any
let initPromise: Promise<void> | null = null

const AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent')
const SANDBOX_EXTENSION = path.join(PI_EXTENSIONS_DIR, 'gondolin-sandbox.ts')
const MODEL_SPEC = process.env.STUDIO_MODEL || 'google/gemini-3.7-flash'
const THINKING_LEVEL = (process.env.STUDIO_THINKING || 'high') as any

function resolveModel(spec = MODEL_SPEC): { model?: any; thinkingLevel?: any } {
  const slash = spec.indexOf('/')
  const provider = slash > 0 ? spec.slice(0, slash) : 'google'
  const id = slash > 0 ? spec.slice(slash + 1) : spec
  const model = modelRuntime.getModel(provider, id)
  if (!model) {
    logger.warn({ provider, id }, 'studio model not found in the runtime — using pi default')
    return { thinkingLevel: THINKING_LEVEL }
  }
  return { model, thinkingLevel: THINKING_LEVEL }
}

export function initStudio(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      modelRuntime = await ModelRuntime.create()
      const m = resolveModel()
      logger.info(
        {
          model: m.model ? `${m.model.provider}/${m.model.id}` : '(pi default)',
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

function addEntry(s: Session, role: EntryRole, text: string, tool?: Entry['tool']): Entry {
  const entry: Entry = {
    id: `e${++s.counter}`,
    role,
    text,
    at: Date.now(),
    ...(tool ? { tool } : {}),
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

function toolLabel(name: string, args: any): string {
  const a = args ?? {}
  const hint = a.url ?? a.out ?? a.file ?? a.path ?? a.pattern ?? a.command ?? a.cmd ?? a.text ?? ''
  const h = String(hint)
  return h ? `${name} · ${h.length > 80 ? `${h.slice(0, 77)}…` : h}` : name
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
      addEntry(s, 'tool', toolLabel(ev.toolName, ev.args), { name: ev.toolName, status: 'running' })
      emit(s, { type: 'tool', name: ev.toolName, args: ev.args ?? {} })
      break
    case 'tool_execution_end': {
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
}

/** Get (or lazily create) the pi session bound to a project. */
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
    const savedPath = opts.sessionFile
    const sessionManager =
      savedPath && existsSync(savedPath)
        ? SessionManager.open(savedPath, undefined, ws.dir)
        : SessionManager.create(ws.dir)

    const extensions = [...(agent.sandbox ? [SANDBOX_EXTENSION] : []), ...agent.extensions]
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

    const extensionTools: string[] = (ext?.extensions ?? []).flatMap((e: any) => [
      ...(e.tools?.keys?.() ?? []),
    ])
    const { session } = await createAgentSession({
      cwd: ws.dir,
      modelRuntime,
      ...resolveModel(),
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
    sessions.set(opts.projectId, s)
    watchWorkspace(
      ws.dir,
      {
        relevant: agent.relevant,
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
      { projectId: opts.projectId, workspace: ws.internal, resumed: Boolean(savedPath) },
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

/** Fire-and-forget prompt; `context` rides along in a tagged block. */
export async function promptSession(
  opts: OpenSessionOptions,
  text: string,
  context?: string,
): Promise<Session> {
  const s = await getSession(opts)
  if (s.busy) {
    const err: any = new Error('The agent is still working on this project')
    err.code = 'BUSY'
    throw err
  }
  addEntry(s, 'user', text)
  setBusy(s, true)
  s.turn += 1
  const full = context ? `<studio-context>\n${context}\n</studio-context>\n\n${text}` : text
  void s.session.prompt(full).catch((err: unknown) => {
    logger.error({ err, projectId: s.projectId }, 'prompt failed')
    emit(s, { type: 'error', message: String((err as Error)?.message ?? err) })
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
