/**
 * Studio sandbox — pi extension.
 *
 * `bash` runs under bubblewrap: a mount namespace holding this project's
 * folder read-write, the shared references read-only, and nothing else; no
 * network, and an environment built from scratch rather than inherited.
 *
 * The file tools (read, write, edit, ls, find, grep) run in this process
 * against the real filesystem, with every path they are given passed through
 * `resolveIn` first — which refuses anything outside the workspace and the
 * shared references, and refuses writes anywhere but the workspace. Shell and
 * file tools see the same absolute paths (../lib/paths.ts), so the agent has
 * one idea of where it is.
 */
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import {
  type BashOperations,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from '@earendil-works/pi-coding-agent'
import { describeWorkspace, PathError, resolveIn, workspaceOf } from '../lib/paths.ts'
import { runInSandbox, sandboxEnv } from '../lib/sandbox.ts'

const BWRAP = process.env.STUDIO_BWRAP || 'bwrap'
const SHELL = process.env.STUDIO_SANDBOX_SHELL || '/bin/bash'

const BASH_DESCRIPTION =
  "Run a shell command in this project's workspace (your cwd, and the only writable place; the " +
  'engine, skills and asset libraries are readable). You have bash, node and python, but NO ' +
  'ffmpeg, browser or network — recon, harvesting, audio, audit and rendering are motion_* tools ' +
  'that run outside the sandbox. When one of them fails you cannot install what it is missing and ' +
  'cannot reach the network: say what failed and stop. Never hand-write a file a tool produces ' +
  '(vo-words.json, cues.json, brand-tokens.json) — those are measurements, and a plausible ' +
  'substitute is a fabricated result nothing downstream can detect.'

function bwrapBashOps(workspace: () => string): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      const ws = workspace()
      // The tool hands us its own cwd; keep it inside a bound directory.
      let guestCwd = ws
      try {
        guestCwd = resolveIn(ws, cwd ?? ws)
      } catch {
        guestCwd = ws
      }
      return runInSandbox(command, {
        workspace: ws,
        cwd: guestCwd,
        env: sandboxEnv(ws, env?.TERM),
        shell: SHELL,
        bwrap: BWRAP,
        onData: onData as (chunk: Buffer) => void,
        signal,
        timeout,
      })
    },
  }
}

export default function bwrapSandbox(pi: ExtensionAPI) {
  let localCwd: string | null = null
  const workspaceFor = (ctx?: ExtensionContext) => localCwd ?? workspaceOf(ctx)

  /**
   * Resolve a file tool's `path`, or refuse.
   *
   * Every pi file tool names it `path`, and on read/write/edit it is required;
   * on ls/find/grep it is optional and the tool falls back to its cwd, which
   * we set to the workspace. So this one key is the whole surface.
   */
  function guardPath(ws: string, params: Record<string, unknown>, mode: 'read' | 'write') {
    const out = { ...params }
    if (typeof out.path === 'string' && out.path) out.path = resolveIn(ws, out.path, mode)
    // find's `pattern` and grep's `glob` are matched against the walked tree,
    // not resolved by us — a `..` in one would climb out of the workspace
    // without ever passing through resolveIn.
    for (const key of ['pattern', 'glob'] as const) {
      const value = out[key]
      if (typeof value !== 'string' || !value) continue
      if (value.startsWith('/') || value.split('/').includes('..')) {
        throw new PathError(
          `the ${key} "${value}" reaches outside this project. Patterns are relative to ${ws}.`,
        )
      }
    }
    return out
  }

  function register(
    tool: { name: string; [k: string]: unknown },
    mode: 'read' | 'write',
    build: (cwd: string) => { execute: (...a: never[]) => unknown },
  ) {
    pi.registerTool({
      ...(tool as never),
      async execute(
        id: string,
        params: Record<string, unknown>,
        signal: AbortSignal,
        onUpdate: unknown,
        ctx: ExtensionContext,
      ) {
        let ws: string
        let safe: Record<string, unknown>
        try {
          ws = workspaceFor(ctx)
          safe = guardPath(ws, params, mode)
        } catch (err) {
          if (err instanceof PathError) {
            return {
              content: [{ type: 'text' as const, text: `Refused: ${err.message}` }],
              details: {},
            }
          }
          throw err
        }
        return (build(ws).execute as never as (...a: unknown[]) => unknown)(
          id,
          safe,
          signal,
          onUpdate,
        )
      },
    } as never)
  }

  const base = (cwd: string) => ({
    read: createReadTool(cwd),
    write: createWriteTool(cwd),
    edit: createEditTool(cwd),
    bash: createBashTool(cwd),
    grep: createGrepTool(cwd),
    find: createFindTool(cwd),
    ls: createLsTool(cwd),
  })
  const proto = base(process.cwd())

  register(proto.read, 'read', createReadTool)
  register(proto.write, 'write', createWriteTool)
  register(proto.edit, 'write', createEditTool)
  register(proto.ls, 'read', createLsTool)
  register(proto.find, 'read', createFindTool)
  register(proto.grep, 'read', createGrepTool)

  pi.registerTool({
    ...proto.bash,
    description: BASH_DESCRIPTION,
    async execute(id, params, signal, onUpdate, ctx) {
      const ws = workspaceFor(ctx)
      return createBashTool(ws, {
        operations: bwrapBashOps(() => ws),
        exposeSessionEnvironment: false,
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.on('session_start', async (_event, ctx) => {
    localCwd = ctx.cwd
  })

  pi.on('before_agent_start', async (event, ctx) => {
    if (!localCwd) localCwd = ctx.cwd
    const hostLine = `Current working directory: ${localCwd}`
    const line = describeWorkspace(localCwd)
    const systemPrompt = event.systemPrompt.includes(hostLine)
      ? event.systemPrompt.replace(hostLine, line)
      : `${event.systemPrompt}\n\n${line}`
    return { systemPrompt }
  })
}
