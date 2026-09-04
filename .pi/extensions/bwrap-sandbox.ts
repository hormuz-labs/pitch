/**
 * Studio sandbox — pi extension.
 *
 * `bash` runs under bubblewrap: a mount namespace holding this project's
 * folder read-write, the three shared references read-only, and nothing else;
 * no network, and an environment built from scratch rather than inherited.
 *
 * The file tools (read, write, edit, ls, find, grep) run in this process
 * against the real filesystem, with every path they are given resolved by
 * `toHostPath` first — which refuses anything outside the workspace, and
 * refuses writes anywhere but the workspace. They present the same
 * /workspace, /engine, /.pi/skills and /assets names the shell sees, so the
 * agent has one idea of where it is.
 *
 * This replaced a Gondolin micro-VM. See ../lib/sandbox.ts for why.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import {
  bwrapCommand,
  explainBwrapFailure,
  GUEST_WORKSPACE,
  SandboxPathError,
  type SharedMounts,
  sandboxEnv,
  toGuestPath,
  toHostPath,
} from '../lib/sandbox.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

const SHARED: SharedMounts = {
  '/engine': path.join(REPO_ROOT, 'engine'),
  '/.pi/skills': path.join(REPO_ROOT, '.pi', 'skills'),
  '/assets': path.join(REPO_ROOT, 'assets'),
}

const BWRAP = process.env.STUDIO_BWRAP || 'bwrap'
const SHELL = process.env.STUDIO_SANDBOX_SHELL || '/bin/bash'

const BASH_DESCRIPTION =
  'Run a shell command in this project. Your workspace is /workspace; ../../engine, ' +
  '../../.pi/skills and ../../assets are mounted read-only. You have bash, node and python, ' +
  'but NO ffmpeg, browser or network — recon, harvesting, audio, audit and rendering are ' +
  'motion_* tools that run outside the sandbox. When one of them fails you cannot install what ' +
  'it is missing and cannot reach the network: say what failed and stop. Never hand-write a ' +
  'file a tool produces (vo-words.json, cues.json, brand-tokens.json) — those are measurements, ' +
  'and a plausible substitute is a fabricated result nothing downstream can detect.'

/**
 * Run one command under bwrap.
 *
 * A sandbox that cannot start is a hard failure, never a fallback to running
 * unconfined: this process holds every API key the product has, and the whole
 * point is that the shell cannot read them. `explainBwrapFailure` turns the
 * kernel's refusal into the compose setting that fixes it.
 */
function bwrapBashOps(workspace: () => string): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      if (signal?.aborted) throw new Error('aborted')
      const ws = workspace()
      // The tool hands us its own cwd; keep it inside a mount.
      let guestCwd = GUEST_WORKSPACE
      try {
        guestCwd = toGuestPath(ws, SHARED, toHostPath(ws, SHARED, cwd ?? GUEST_WORKSPACE))
      } catch {
        guestCwd = GUEST_WORKSPACE
      }

      const argv = bwrapCommand(command, {
        workspace: ws,
        shared: SHARED,
        cwd: guestCwd,
        env: sandboxEnv(env?.TERM),
        shell: SHELL,
      })

      return await new Promise<{ exitCode: number }>((resolve, reject) => {
        const child = spawn(BWRAP, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderrHead = ''
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          fn()
        }

        const onAbort = () => {
          child.kill('SIGKILL')
          finish(() => reject(new Error('aborted')))
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        const timer =
          timeout && timeout > 0
            ? setTimeout(() => {
                child.kill('SIGKILL')
                finish(() => reject(new Error(`timeout:${timeout}`)))
              }, timeout * 1000)
            : (undefined as unknown as NodeJS.Timeout)

        child.stdout.on('data', (c: Buffer) => onData(c.toString()))
        child.stderr.on('data', (c: Buffer) => {
          const text = c.toString()
          if (stderrHead.length < 2000) stderrHead += text
          onData(text)
        })

        child.on('error', err => {
          const why = explainBwrapFailure(String((err as NodeJS.ErrnoException).code ?? err))
          finish(() => reject(new Error(`the sandbox could not start: ${why ?? String(err)}`)))
        })

        child.on('close', code => {
          // bwrap exits 1 with its own diagnostic before the command ever runs.
          const why = code !== 0 ? explainBwrapFailure(stderrHead) : null
          if (why) {
            finish(() => reject(new Error(`the sandbox could not start: ${why}`)))
            return
          }
          finish(() => resolve({ exitCode: code ?? 0 }))
        })
      })
    },
  }
}

export default function bwrapSandbox(pi: ExtensionAPI) {
  let localCwd: string | null = null
  const workspaceFor = (ctx?: ExtensionContext) => localCwd ?? ctx?.cwd ?? process.cwd()

  /**
   * Resolve a file tool's `path` to a real host path, or refuse.
   *
   * Every pi file tool names it `path`, and on read/write/edit it is required;
   * on ls/find/grep it is optional and the tool falls back to its cwd, which
   * we set to the workspace. So this one key is the whole surface.
   */
  function guardPath(ws: string, params: Record<string, unknown>, mode: 'read' | 'write') {
    const out = { ...params }
    if (typeof out.path === 'string' && out.path) {
      out.path = toHostPath(ws, SHARED, out.path, mode)
    }
    // find's `pattern` and grep's `glob` are matched against the walked tree,
    // not resolved by us — a `..` in one would climb out of the workspace
    // without ever passing through toHostPath.
    for (const key of ['pattern', 'glob'] as const) {
      const value = out[key]
      if (typeof value !== 'string' || !value) continue
      if (value.startsWith('/') || value.split('/').includes('..')) {
        throw new SandboxPathError(
          `the ${key} "${value}" reaches outside this project. Patterns are relative to ${GUEST_WORKSPACE}.`,
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
        const ws = workspaceFor(ctx)
        let safe: Record<string, unknown>
        try {
          safe = guardPath(ws, params, mode)
        } catch (err) {
          if (err instanceof SandboxPathError) {
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
      return createBashTool(GUEST_WORKSPACE, {
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
    const guestLine =
      `Current working directory: ${GUEST_WORKSPACE} (this project's workspace, and the only ` +
      `place you can write). Shared references are mounted read-only at /engine, /.pi/skills ` +
      `and /assets, so the usual relative paths (../../engine/schema.md, ../../assets/music) ` +
      `work unchanged. Your shell has no network and cannot see anything else on this machine.`
    const systemPrompt = event.systemPrompt.includes(hostLine)
      ? event.systemPrompt.replace(hostLine, guestLine)
      : `${event.systemPrompt}\n\n${guestLine}`
    return { systemPrompt }
  })
}
