/**
 * Gondolin sandbox — pi extension for the studio.
 *
 * Every built-in tool the agent has (bash, read, write, edit, grep, find, ls)
 * runs inside a local Linux micro-VM instead of on the host. The job
 * workspace is mounted read-write at /workspace; the shared references are
 * mounted read-only where the workspace's relative paths expect them:
 *
 *   host projects/<name>       →  /workspace          (rw)
 *   host engine/               →  /engine             (ro)   ../../engine from /workspace
 *   host .pi/skills/           →  /.pi/skills         (ro)   ../../.pi/skills
 *   host assets/               →  /assets             (ro)   ../../assets
 *
 * Nothing else from the host exists in the guest: no environment, no .env,
 * no ~/.pi credentials, no other projects, and no network. Anything that
 * needs Chromium, ffmpeg or an API key (recon, harvest, audit, render, TTS,
 * SFX, mix) is a `motion_*` tool that runs on the host with its own path
 * checks — see html-motion-tools.ts.
 *
 * Adapted from pi's examples/extensions/gondolin: the workspace comes from
 * the session (`ctx.cwd`) rather than process.cwd(), there is no TUI, and
 * idle VMs are shut down to bound memory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RealFSProvider, VM } from '@earendil-works/gondolin'
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
  DEFAULT_MAX_BYTES,
  type EditOperations,
  type FindOperations,
  formatSize,
  type GrepToolDetails,
  type GrepToolInput,
  type LsOperations,
  type ReadOperations,
  truncateHead,
  truncateLine,
  type WriteOperations,
} from '@earendil-works/pi-coding-agent'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const GUEST_WORKSPACE = '/workspace'
const SHARED_MOUNTS: Record<string, string> = {
  '/engine': path.join(REPO_ROOT, 'engine'),
  '/.pi/skills': path.join(REPO_ROOT, '.pi', 'skills'),
  '/assets': path.join(REPO_ROOT, 'assets'),
}
const DEFAULT_GREP_LIMIT = 100

const WRITE_METHOD =
  /^(write|append|mkdir|mkdtemp|rmdir|rm|unlink|rename|link|symlink|truncate|ftruncate|chmod|chown|lchmod|lchown|utimes|lutimes|copyFile|cp|create)/
const WRITE_FLAGS = /[wa+]/

/**
 * RealFSProvider has no read-only mode, so guard it: every mutating method,
 * and any open() with a write flag, fails with EROFS. Reads pass through.
 */
function readOnly<T extends object>(provider: T): T {
  const deny = () => {
    const err = new Error('EROFS: read-only file system') as NodeJS.ErrnoException
    err.code = 'EROFS'
    err.errno = -30
    throw err
  }
  return new Proxy(provider, {
    get(target, prop, receiver) {
      if (prop === 'readonly') return true
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function' || typeof prop !== 'string') return value
      if (WRITE_METHOD.test(prop)) return deny
      if (prop === 'open' || prop === 'openSync') {
        return (...args: unknown[]) => {
          const flags = args[1]
          if (typeof flags === 'string' && WRITE_FLAGS.test(flags)) deny()
          if (typeof flags === 'number' && (flags & 3) !== 0) deny()
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return value.bind(target)
    },
  })
}
const IDLE_SHUTDOWN_MS = Number(process.env.GONDOLIN_IDLE_MS ?? 10 * 60 * 1000)
const VM_MEMORY = process.env.GONDOLIN_MEMORY ?? '1G'
const VM_CPUS = Number(process.env.GONDOLIN_CPUS ?? 2)

type TextToolResult<TDetails> = {
  content: Array<{ type: 'text'; text: string }>
  details: TDetails | undefined
}

function stripAtPrefix(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value
}

function toPosix(value: string): string {
  return value.split(path.sep).join(path.posix.sep)
}

function isInsideHostPath(root: string, value: string): boolean {
  const relativePath = path.relative(root, value)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function hostPathToGuest(localCwd: string, hostPath: string): string {
  if (isInsideHostPath(localCwd, hostPath)) {
    const relativePath = path.relative(localCwd, hostPath)
    return relativePath ? path.posix.join(GUEST_WORKSPACE, toPosix(relativePath)) : GUEST_WORKSPACE
  }
  for (const [guestRoot, hostRoot] of Object.entries(SHARED_MOUNTS)) {
    if (isInsideHostPath(hostRoot, hostPath)) {
      const relativePath = path.relative(hostRoot, hostPath)
      return relativePath ? path.posix.join(guestRoot, toPosix(relativePath)) : guestRoot
    }
  }
  return toPosix(hostPath)
}

/**
 * Map a tool path to a guest path. Relative paths resolve against the guest
 * workspace, so "../../engine/schema.md" lands on the read-only /engine mount.
 * Absolute host paths inside the workspace or a shared mount are translated;
 * any other absolute path is taken as a guest path (where it simply does not
 * exist).
 */
function toGuestPath(localCwd: string, inputPath: string): string {
  const trimmed = stripAtPrefix(inputPath.trim())
  if (!trimmed) return GUEST_WORKSPACE
  if (path.isAbsolute(trimmed)) {
    if (isInsideHostPath(localCwd, trimmed)) return hostPathToGuest(localCwd, trimmed)
    for (const hostRoot of Object.values(SHARED_MOUNTS)) {
      if (isInsideHostPath(hostRoot, trimmed)) return hostPathToGuest(localCwd, trimmed)
    }
    return path.posix.resolve('/', toPosix(trimmed))
  }
  return path.posix.resolve(GUEST_WORKSPACE, toPosix(trimmed))
}

function createGondolinReadOps(vm: VM, localCwd: string): ReadOperations {
  return {
    readFile: async filePath => vm.fs.readFile(toGuestPath(localCwd, filePath)),
    access: async filePath => {
      await vm.fs.access(toGuestPath(localCwd, filePath))
    },
    detectImageMimeType: async filePath => {
      const ext = path.posix.extname(toGuestPath(localCwd, filePath)).toLowerCase()
      if (ext === '.png') return 'image/png'
      if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
      if (ext === '.gif') return 'image/gif'
      if (ext === '.webp') return 'image/webp'
      return null
    },
  }
}

function createGondolinWriteOps(vm: VM, localCwd: string): WriteOperations {
  return {
    writeFile: async (filePath, content) => {
      await vm.fs.writeFile(toGuestPath(localCwd, filePath), content, { encoding: 'utf8' })
    },
    mkdir: async dirPath => {
      await vm.fs.mkdir(toGuestPath(localCwd, dirPath), { recursive: true })
    },
  }
}

function createGondolinEditOps(vm: VM, localCwd: string): EditOperations {
  const readOps = createGondolinReadOps(vm, localCwd)
  const writeOps = createGondolinWriteOps(vm, localCwd)
  return {
    readFile: readOps.readFile,
    writeFile: writeOps.writeFile,
    access: readOps.access,
  }
}

function createGondolinLsOps(vm: VM, localCwd: string): LsOperations {
  return {
    exists: async filePath => {
      try {
        await vm.fs.access(toGuestPath(localCwd, filePath))
        return true
      } catch {
        return false
      }
    },
    stat: async filePath => vm.fs.stat(toGuestPath(localCwd, filePath)),
    readdir: async dirPath => vm.fs.listDir(toGuestPath(localCwd, dirPath)),
  }
}

async function walkGuestFiles(
  vm: VM,
  root: string,
  visit: (guestPath: string, relativePath: string) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) throw new Error('Operation aborted')
  const stat = await vm.fs.stat(root, { signal })
  if (!stat.isDirectory()) return visit(root, path.posix.basename(root))

  const walkDirectory = async (dir: string, relativeDir: string): Promise<boolean> => {
    if (signal?.aborted) throw new Error('Operation aborted')
    const entries = await vm.fs.listDir(dir, { signal })
    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules' || entry === 'vendor') continue
      const guestPath = path.posix.join(dir, entry)
      const relativePath = relativeDir ? path.posix.join(relativeDir, entry) : entry
      let entryStat: Awaited<ReturnType<VM['fs']['stat']>>
      try {
        entryStat = await vm.fs.stat(guestPath, { signal })
      } catch {
        continue
      }
      if (entryStat.isDirectory()) {
        if (!(await walkDirectory(guestPath, relativePath))) return false
      } else if (!(await visit(guestPath, relativePath))) {
        return false
      }
    }
    return true
  }

  return walkDirectory(root, '')
}

function matchesToolGlob(relativePath: string, pattern: string): boolean {
  const normalizedPattern = toPosix(pattern)
  if (normalizedPattern.includes('/')) {
    return (
      path.posix.matchesGlob(relativePath, normalizedPattern) ||
      path.posix.matchesGlob(relativePath, `**/${normalizedPattern}`)
    )
  }
  return path.posix.matchesGlob(path.posix.basename(relativePath), normalizedPattern)
}

function createGondolinFindOps(vm: VM, localCwd: string): FindOperations {
  return {
    exists: async filePath => {
      try {
        await vm.fs.access(toGuestPath(localCwd, filePath))
        return true
      } catch {
        return false
      }
    },
    glob: async (pattern, cwd, options) => {
      const root = toGuestPath(localCwd, cwd)
      const results: string[] = []
      await walkGuestFiles(vm, root, async (guestPath, relativePath) => {
        if (results.length >= options.limit) return false
        if (matchesToolGlob(relativePath, pattern)) results.push(guestPath)
        return results.length < options.limit
      })
      return results
    },
  }
}

async function executeGondolinGrep(
  vm: VM,
  localCwd: string,
  params: GrepToolInput,
  signal?: AbortSignal,
): Promise<TextToolResult<GrepToolDetails>> {
  const root = toGuestPath(localCwd, params.path ?? '.')
  const limit = params.limit ?? DEFAULT_GREP_LIMIT
  const flags = params.ignoreCase ? 'i' : ''
  const source = params.literal
    ? params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : params.pattern
  const regex = new RegExp(source, flags)
  const contextLines = params.context ?? 0
  const lines: string[] = []
  let matchCount = 0
  let filesSearched = 0
  const rootStat = await vm.fs.stat(root, { signal })
  const rootIsDirectory = rootStat.isDirectory()

  await walkGuestFiles(
    vm,
    root,
    async (guestPath, relativePath) => {
      if (params.glob && !matchesToolGlob(relativePath, params.glob)) return true
      let content: string
      try {
        content = await vm.fs.readFile(guestPath, { encoding: 'utf8', signal })
      } catch {
        return true
      }
      filesSearched += 1
      const fileLines = content.split(/\r?\n/)
      const displayPath = rootIsDirectory ? relativePath : path.posix.basename(guestPath)
      for (let i = 0; i < fileLines.length; i++) {
        if (!regex.test(fileLines[i])) continue
        matchCount += 1
        const from = Math.max(0, i - contextLines)
        const to = Math.min(fileLines.length - 1, i + contextLines)
        for (let j = from; j <= to; j++) {
          const marker = j === i ? ':' : '-'
          lines.push(`${displayPath}${marker}${j + 1}${marker}${truncateLine(fileLines[j]).text}`)
        }
        if (contextLines > 0) lines.push('--')
        if (matchCount >= limit) return false
      }
      return true
    },
    signal,
  )

  let output = lines.join('\n')
  if (!output) output = 'No matches found'
  const truncation = truncateHead(output, { maxBytes: DEFAULT_MAX_BYTES })
  output = truncation.content
  const notices: string[] = []
  if (matchCount >= limit) notices.push(`${limit} match limit reached`)
  if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`)
  if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`
  return {
    content: [{ type: 'text', text: output }],
    details: {
      matchCount,
      filesSearched,
      truncation: truncation.truncated ? truncation : undefined,
    } as never,
  }
}

function sanitizeEnv(env: NodeJS.ProcessEnv | undefined): Record<string, string> {
  // The guest gets a minimal environment of its own — never the host's.
  const out: Record<string, string> = {
    HOME: '/root',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    TERM: env?.TERM ?? 'xterm',
    LANG: 'C.UTF-8',
    STUDIO_SANDBOX: 'gondolin',
  }
  return out
}

function createGondolinBashOps(vm: VM, localCwd: string, shellPath: string): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      if (signal?.aborted) throw new Error('aborted')
      const guestCwd = toGuestPath(localCwd, cwd)
      const controller = new AbortController()
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })

      let timedOut = false
      const timer =
        timeout && timeout > 0
          ? setTimeout(() => {
              timedOut = true
              controller.abort()
            }, timeout * 1000)
          : undefined

      try {
        const proc = vm.exec([shellPath, '-lc', command], {
          cwd: guestCwd,
          env: sanitizeEnv(env),
          signal: controller.signal,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        for await (const chunk of proc.output()) onData(chunk.data)
        const result = await proc
        return { exitCode: result.exitCode }
      } catch (error) {
        if (signal?.aborted) throw new Error('aborted')
        if (timedOut) throw new Error(`timeout:${timeout}`)
        throw error
      } finally {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

export default function gondolinSandbox(pi: ExtensionAPI) {
  // Each studio session has its own extension instance; the workspace is the
  // session cwd (projects/<name>), learned from the first context we see.
  let localCwd: string | null = null
  let vm: VM | undefined
  let vmStarting: Promise<VM> | undefined
  let shellPath = '/bin/sh'
  let idleTimer: NodeJS.Timeout | undefined

  const log = (msg: string) =>
    console.log(`[gondolin${localCwd ? ` ${path.basename(localCwd)}` : ''}] ${msg}`)

  function touch() {
    if (idleTimer) clearTimeout(idleTimer)
    if (IDLE_SHUTDOWN_MS > 0) {
      idleTimer = setTimeout(() => void shutdown('idle'), IDLE_SHUTDOWN_MS)
      idleTimer.unref?.()
    }
  }

  async function shutdown(reason: string) {
    const active = vm
    vm = undefined
    vmStarting = undefined
    if (idleTimer) clearTimeout(idleTimer)
    if (!active) return
    log(`stopping VM (${reason})`)
    try {
      await active.close()
    } catch (err) {
      log(`close failed: ${String(err)}`)
    }
  }

  async function startVm(): Promise<VM> {
    if (!localCwd) throw new Error('gondolin: workspace unknown')
    log(`starting VM, ${localCwd} → ${GUEST_WORKSPACE}`)
    const mounts: Record<string, RealFSProvider> = {
      [GUEST_WORKSPACE]: new RealFSProvider(localCwd),
    }
    for (const [guestRoot, hostRoot] of Object.entries(SHARED_MOUNTS)) {
      mounts[guestRoot] = readOnly(new RealFSProvider(hostRoot))
    }
    const created = await VM.create({
      sessionLabel: `studio ${path.basename(localCwd)}`,
      memory: VM_MEMORY,
      cpus: VM_CPUS,
      // No egress at all: recon and harvesting happen through host tools.
      sandbox: { netEnabled: false },
      vfs: { mounts },
    })
    const bashProbe = await created.exec(['/bin/sh', '-lc', 'command -v bash || true'])
    shellPath = bashProbe.stdout.trim() || '/bin/sh'
    vm = created
    log(`VM ${created.id.slice(0, 8)} ready (${shellPath})`)
    return created
  }

  async function ensureVm(ctx?: ExtensionContext): Promise<VM> {
    if (!localCwd && ctx?.cwd) localCwd = ctx.cwd
    touch()
    if (vm) return vm
    if (!vmStarting) {
      vmStarting = startVm().finally(() => {
        vmStarting = undefined
      })
    }
    return vmStarting
  }

  pi.on('session_start', async (_event, ctx) => {
    localCwd = ctx.cwd
    // Boot lazily on first tool use; a warm start here would delay the first reply.
  })

  pi.on('session_shutdown', async () => {
    await shutdown('session shutdown')
  })

  const workspaceFor = (ctx?: ExtensionContext) => localCwd ?? ctx?.cwd ?? process.cwd()
  const local = (cwd: string) => ({
    read: createReadTool(cwd),
    write: createWriteTool(cwd),
    edit: createEditTool(cwd),
    bash: createBashTool(cwd),
    grep: createGrepTool(cwd),
    find: createFindTool(cwd),
    ls: createLsTool(cwd),
  })
  const base = local(process.cwd())

  pi.registerTool({
    ...base.read,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return createReadTool(GUEST_WORKSPACE, {
        operations: createGondolinReadOps(activeVm, workspaceFor(ctx)),
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.registerTool({
    ...base.write,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return createWriteTool(GUEST_WORKSPACE, {
        operations: createGondolinWriteOps(activeVm, workspaceFor(ctx)),
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.registerTool({
    ...base.edit,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return createEditTool(GUEST_WORKSPACE, {
        operations: createGondolinEditOps(activeVm, workspaceFor(ctx)),
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.registerTool({
    ...base.bash,
    description:
      'Run a shell command inside the sandbox VM. Your workspace is /workspace (this project); ' +
      '../../engine, ../../.pi/skills and ../../assets are mounted read-only. The VM has a plain ' +
      'Linux userland with no node, ffmpeg, browser or network — use the motion_* tools for ' +
      'recon, harvesting, audio, audit and rendering.',
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return createBashTool(GUEST_WORKSPACE, {
        operations: createGondolinBashOps(activeVm, workspaceFor(ctx), shellPath),
        exposeSessionEnvironment: false,
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.registerTool({
    ...base.ls,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return createLsTool(GUEST_WORKSPACE, {
        operations: createGondolinLsOps(activeVm, workspaceFor(ctx)),
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.registerTool({
    ...base.find,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return createFindTool(GUEST_WORKSPACE, {
        operations: createGondolinFindOps(activeVm, workspaceFor(ctx)),
      }).execute(id, params, signal, onUpdate)
    },
  })

  pi.registerTool({
    ...base.grep,
    async execute(_id, params, signal, _onUpdate, ctx) {
      const activeVm = await ensureVm(ctx)
      return executeGondolinGrep(
        activeVm,
        workspaceFor(ctx),
        params as GrepToolInput,
        signal,
      ) as never
    },
  })

  pi.on('before_agent_start', async (event, ctx) => {
    if (!localCwd) localCwd = ctx.cwd
    const localLine = `Current working directory: ${localCwd}`
    const guestLine =
      `Current working directory: ${GUEST_WORKSPACE} (a sandbox VM; this project's workspace). ` +
      `Shared references are mounted read-only at /engine, /.pi/skills and /assets, so the usual ` +
      `relative paths (../../engine/schema.md, ../../assets/music) work unchanged.`
    const systemPrompt = event.systemPrompt.includes(localLine)
      ? event.systemPrompt.replace(localLine, guestLine)
      : `${event.systemPrompt}\n\n${guestLine}`
    return { systemPrompt }
  })
}
