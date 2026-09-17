/**
 * Host actions: things a flow's pi tools need the API process to do (save a
 * deck, patch a storyboard, run a render). Extensions in .pi/extensions/
 * are loaded by pi inside this same process, so they reach these through a
 * global registry rather than importing API internals.
 *
 * Every action receives the workspace it was called from (resolved from the
 * tool's cwd), so it can authorise against the owning user and job, and a
 * context for the two things a long action needs: a progress line and a
 * cancellation signal.
 *
 * An action registered with `remote: true` is one that burns CPU — a
 * capture, an encode, a transcription. On a worker in remote mode
 * (worker/config.ts → STUDIO_RENDER) the registry hands such a call to the
 * dispatcher, which queues it as a RenderJob for the render tier and waits;
 * the action's own code then runs on a render pod against the restored
 * checkpoint, and the files it wrote come back into this workspace. The
 * action does not know where it ran. Everywhere else the action runs here.
 */
import { parseInternal, type Workspace } from './paths.js'

export interface HostContext {
  /** Where a long action is (stage name, optional percent) for whoever is watching. */
  progress?: (stage: string, percent?: number) => void
  /** Aborted when the caller gave up: an export cancelled, a job withdrawn. */
  signal?: AbortSignal
}

export type HostAction = (
  ws: Workspace,
  params: Record<string, any>,
  ctx: HostContext,
) => Promise<string>

export interface HostActionOptions {
  /** The action is heavy and may run on the render tier instead of here. */
  remote?: boolean
}

/** What a remote dispatcher does with a call: run it elsewhere and return the result. */
export type RemoteDispatcher = (
  ws: Workspace,
  name: string,
  params: Record<string, any>,
  ctx: HostContext,
) => Promise<string>

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

/** Seconds of host compute this workspace has run up since the last drain. */
export function takeComputeSeconds(internal: string): number {
  const seconds = spent.get(internal) ?? 0
  spent.delete(internal)
  return seconds
}

/** Host compute accrued without draining it, for live affordability checks. */
export function peekComputeSeconds(internal: string): number {
  return spent.get(internal) ?? 0
}

interface Entry {
  fn: HostAction
  remote: boolean
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
        try {
          // The dispatcher exists only on a worker in remote mode, so a heavy
          // action reached from there — directly or from inside a light one —
          // goes to the render tier; on the render pod itself there is none.
          if (entry.remote && reg.dispatcher)
            return await reg.dispatcher(ws, name, params ?? {}, ctx)
          return await entry.fn(ws, params ?? {}, ctx)
        } finally {
          const d = (depth.get(ws.internal) ?? 1) - 1
          if (d > 0) depth.set(ws.internal, d)
          else depth.delete(ws.internal)
          // Metered even when the action throws: a render that failed after
          // four minutes still burned four minutes of machine. Only the
          // outermost call counts, so an action calling another is not billed twice.
          if (!nested) {
            const seconds = (Date.now() - started) / 1000
            spent.set(ws.internal, (spent.get(ws.internal) ?? 0) + seconds)
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
