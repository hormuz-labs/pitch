/**
 * Host actions: things a flow's pi tools need the API process to do (save a
 * deck, patch a storyboard, queue a render). Extensions in .pi/extensions/
 * are loaded by pi inside this same process, so they reach these through a
 * global registry rather than importing API internals.
 *
 * Every action receives the workspace it was called from (resolved from the
 * tool's cwd), so it can authorise against the owning user and job.
 */
import { parseInternal, type Workspace } from './paths.js'

export type HostAction = (ws: Workspace, params: Record<string, any>) => Promise<string>

/**
 * Wall-clock seconds spent in host actions, per workspace.
 *
 * Every expensive thing the studio does — encoding, recording a browser,
 * rendering slides — is a host action, so timing them here meters compute
 * once instead of at each pipeline's call site. Projects bill against this
 * (projects/usage.ts) and drain it when they do.
 */
const spent = new Map<string, number>()

/** Seconds of host compute this workspace has run up since the last drain. */
export function takeComputeSeconds(internal: string): number {
  const seconds = spent.get(internal) ?? 0
  spent.delete(internal)
  return seconds
}

interface Registry {
  actions: Map<string, HostAction>
  call(cwd: string, name: string, params: Record<string, any>): Promise<string>
}

const KEY = '__pitchStudioHost'

function registry(): Registry {
  const g = globalThis as any
  if (!g[KEY]) {
    const actions = new Map<string, HostAction>()
    g[KEY] = {
      actions,
      async call(cwd: string, name: string, params: Record<string, any>) {
        const fn = actions.get(name)
        if (!fn) throw new Error(`studio host action not available: ${name}`)
        const ws = parseInternal(cwd.split('/').filter(Boolean).pop() ?? '')
        if (!ws || ws.dir !== cwd) throw new Error(`not a studio workspace: ${cwd}`)
        const started = Date.now()
        try {
          return await fn(ws, params ?? {})
        } finally {
          // Metered even when the action throws: a render that failed after
          // four minutes still burned four minutes of machine.
          const seconds = (Date.now() - started) / 1000
          spent.set(ws.internal, (spent.get(ws.internal) ?? 0) + seconds)
        }
      },
    } satisfies Registry
  }
  return g[KEY]
}

export function registerHostAction(name: string, fn: HostAction): void {
  registry().actions.set(name, fn)
}

/** Used by the extensions (see .pi/lib/studio-host.ts). */
export function callHostAction(
  cwd: string,
  name: string,
  params: Record<string, any>,
): Promise<string> {
  return registry().call(cwd, name, params)
}
