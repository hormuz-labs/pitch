/**
 * Host actions: things a flow's pi tools need the API process to do (save a
 * deck, patch a storyboard, run a render). Extensions in .pi/extensions/
 * are loaded by pi inside this same process, so they reach these through a
 * global registry rather than importing API internals.
 *
 * Every action receives the workspace it was called from (resolved from the
 * tool's cwd), so it can authorise against the owning user and job.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { parseInternal, type Workspace } from './paths.js'

export type HostAction = (
  ws: Workspace,
  params: Record<string, any>,
  ctx: HostContext,
) => Promise<string>

export interface HostContext {
  progress?: (stage: string, percent?: number) => void
  signal?: AbortSignal
}

export interface HostActionOptions {
  remote?: boolean
}

export type RemoteDispatcher = (
  ws: Workspace,
  name: string,
  params: Record<string, any>,
  ctx: HostContext,
) => Promise<string>

interface Entry {
  fn: HostAction
  remote: boolean
}

/**
 * Wall-clock seconds spent in host actions, per workspace.
 *
 * Every expensive thing the studio does — encoding, recording a browser,
 * rendering slides — is a host action, so timing them here meters compute
 * once instead of at each pipeline's call site. Projects bill against this
 * (projects/usage.ts) and drain it when they do. A remote action is metered
 * by the worker that waited for it: the wall clock is the same, and it is
 * the project that pays for the machine.
 */
const spent = new Map<string, number>()
const active = new Map<string, Set<{ controller: AbortController; started: number }>>()
const signalContext = new AsyncLocalStorage<AbortSignal>()
let beforeCall: ((ws: Workspace, name: string) => Promise<void>) | null = null

/** Seconds of host compute this workspace has run up since the last drain. */
export function takeComputeSeconds(internal: string): number {
  const seconds = spent.get(internal) ?? 0
  spent.delete(internal)
  return seconds
}

/** Host compute accrued without draining it, for live affordability checks. */
export function peekComputeSeconds(internal: string): number {
  const running = [...(active.get(internal) ?? [])].reduce(
    (sum, call) => sum + (Date.now() - call.started) / 1000,
    0,
  )
  return (spent.get(internal) ?? 0) + running
}

/**
 * Third-party spend, in dollars, per workspace: what a host action paid a
 * provider for (a generated clip). Recorded by the action that made the call,
 * because only it knows what came back, and drained with compute when the
 * turn bills. Nothing is recorded for an action that did not reach a provider.
 */
const providerSpent = new Map<string, number>()

export function recordProviderUsd(internal: string, usd: number): void {
  if (!Number.isFinite(usd) || usd <= 0) return
  providerSpent.set(internal, (providerSpent.get(internal) ?? 0) + usd)
}

export function takeProviderUsd(internal: string): number {
  const usd = providerSpent.get(internal) ?? 0
  providerSpent.delete(internal)
  return usd
}

export function peekProviderUsd(internal: string): number {
  return providerSpent.get(internal) ?? 0
}

export function abortHostActions(internal: string): void {
  for (const call of active.get(internal) ?? []) call.controller.abort()
}

export function hostActionSignal(): AbortSignal | undefined {
  return signalContext.getStore()
}

export function setHostActionGuard(
  guard: ((ws: Workspace, name: string) => Promise<void>) | null,
): void {
  beforeCall = guard
}

interface Registry {
  actions: Map<string, Entry>
  /** Set on a worker in remote mode; null means every action runs here. */
  dispatcher: RemoteDispatcher | null
  /** Actions currently running per workspace: only the outermost is metered. */
  depth: Map<string, number>
  call(cwd: string, name: string, params: Record<string, any>, ctx?: HostContext): Promise<string>
  invoke(
    ws: Workspace,
    name: string,
    params: Record<string, any>,
    ctx?: HostContext,
  ): Promise<string>
}

const KEY = '__pitchStudioHost'

function registry(): Registry {
  const g = globalThis as any
  if (!g[KEY]) {
    const actions = new Map<string, Entry>()
    const depth = new Map<string, number>()
    const reg: Registry = {
      actions,
      dispatcher: null,
      depth,
      async call(cwd, name, params, ctx = {}) {
        const ws = parseInternal(cwd.split('/').filter(Boolean).pop() ?? '')
        if (!ws || ws.dir !== cwd) throw new Error(`not a studio workspace: ${cwd}`)
        return reg.invoke(ws, name, params, ctx)
      },
      async invoke(ws, name, params, ctx = {}) {
        const entry = actions.get(name)
        if (!entry) throw new Error(`studio host action not available: ${name}`)
        const nested = (depth.get(ws.internal) ?? 0) > 0
        depth.set(ws.internal, (depth.get(ws.internal) ?? 0) + 1)
        const started = Date.now()
        const controller = new AbortController()
        const onAbort = () => controller.abort()
        ctx.signal?.addEventListener('abort', onAbort, { once: true })
        if (ctx.signal?.aborted) controller.abort()
        const calls = active.get(ws.internal) ?? new Set()
        const call = { controller, started }
        if (!nested) {
          calls.add(call)
          active.set(ws.internal, calls)
        }
        const effective = { ...ctx, signal: controller.signal }
        try {
          return await signalContext.run(controller.signal, async () => {
            controller.signal.throwIfAborted()
            if (beforeCall) {
              let onGuardAbort: (() => void) | undefined
              const aborted = new Promise<never>((_resolve, reject) => {
                onGuardAbort = () => reject(controller.signal.reason)
                controller.signal.addEventListener('abort', onGuardAbort, { once: true })
              })
              try {
                await Promise.race([beforeCall(ws, name), aborted])
              } finally {
                if (onGuardAbort) controller.signal.removeEventListener('abort', onGuardAbort)
              }
            }
            controller.signal.throwIfAborted()
            if (entry.remote && reg.dispatcher)
              return reg.dispatcher(ws, name, params ?? {}, effective)
            return entry.fn(ws, params ?? {}, effective)
          })
        } finally {
          ctx.signal?.removeEventListener('abort', onAbort)
          const d = (depth.get(ws.internal) ?? 1) - 1
          if (d > 0) depth.set(ws.internal, d)
          else depth.delete(ws.internal)
          if (!nested) {
            const seconds = (Date.now() - started) / 1000
            spent.set(ws.internal, (spent.get(ws.internal) ?? 0) + seconds)
            calls.delete(call)
            if (!calls.size) active.delete(ws.internal)
          }
        }
      },
    }
    g[KEY] = reg
  }
  return g[KEY]
}

export function registerHostAction(
  name: string,
  fn: HostAction,
  opts: HostActionOptions = {},
): void {
  registry().actions.set(name, { fn, remote: opts.remote === true })
}

/** Whether `name` was registered as heavy (may run on the render tier). */
export function isRemoteAction(name: string): boolean {
  return registry().actions.get(name)?.remote === true
}

/** Every registered action name; the render tier refuses jobs naming others. */
export function hostActionNames(): string[] {
  return [...registry().actions.keys()]
}

/**
 * Install (or remove, with null) the remote dispatcher. A worker in remote
 * mode installs worker/remote.ts at boot; the render tier, the single box
 * and the tests leave it unset and run everything in-process.
 */
export function setRemoteDispatcher(dispatcher: RemoteDispatcher | null): void {
  registry().dispatcher = dispatcher
}

/** Run an action for a workspace the caller already resolved (exports, actions running others). */
export function invokeHostAction(
  ws: Workspace,
  name: string,
  params: Record<string, any>,
  ctx?: HostContext,
): Promise<string> {
  return registry().invoke(ws, name, params, ctx)
}

/** Used by the extensions (see .pi/lib/studio-host.ts): the tool's cwd names the workspace. */
export function callHostAction(
  cwd: string,
  name: string,
  params: Record<string, any>,
  ctx?: HostContext,
): Promise<string> {
  return registry().call(cwd, name, params, ctx)
}
