/**
 * The studio sandbox: bubblewrap.
 *
 * The agent's shell runs inside the API container, which holds every secret
 * the product has — Clerk, Dodo, S3, Gemini, the database URL — and a
 * projects/ volume containing every user's workspace. So `bash` gets a mount
 * namespace of its own: this project's folder read-write, the shared
 * references read-only, and nothing else. No network, no host environment.
 *
 * Everything is bound at the path it already has (see ../lib/paths.ts), so
 * the shell, the file tools and the host tools agree about every path without
 * translation. The file tools run in this process against the real
 * filesystem with `resolveIn` in front of them; that one check is the whole
 * of their security, and it is the same check the host tools apply.
 *
 * This replaced a Gondolin micro-VM. The VM was correct but expensive: a KVM
 * guest per session, qemu in the image, and a re-implementation of read,
 * write, edit, ls, find and grep against its virtual filesystem, when only
 * ONE tool ever needed the isolation.
 *
 * Everything here is pure — argv construction — so it can be tested anywhere.
 * `bwrap` itself only exists on Linux: on macOS (a developer's laptop, no
 * container, no secrets worth a namespace) the shell runs unconfined, with the
 * same built-from-scratch environment, and `STUDIO_SANDBOX=none|bwrap` overrides
 * the platform's default either way. The file tools' path guard applies in
 * both modes; only the mount namespace is missing.
 */
import { SHARED_ROOTS } from './paths.ts'

export type SandboxMode = 'bwrap' | 'unconfined'

/**
 * Which sandbox this host gets. Linux: bubblewrap. macOS: none — bwrap does
 * not exist there. `STUDIO_SANDBOX` forces either.
 */
export function sandboxMode(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): SandboxMode {
  const forced = (env.STUDIO_SANDBOX || '').toLowerCase()
  if (forced === 'none' || forced === 'unconfined' || forced === 'off') return 'unconfined'
  if (forced === 'bwrap') return 'bwrap'
  return platform === 'darwin' ? 'unconfined' : 'bwrap'
}

/**
 * The guest's whole environment. Never the host's: that is where the API keys
 * are, and an agent that can read process.env has read every secret.
 */
export function sandboxEnv(workspace: string, term = 'xterm'): Record<string, string> {
  return {
    HOME: '/root',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    TERM: term,
    LANG: 'C.UTF-8',
    PWD: workspace,
    STUDIO_SANDBOX: 'bwrap',
  }
}

export interface BwrapOptions {
  /** Bound read-write, at its own path. */
  workspace: string
  /** Bound read-only, each at its own path. Defaults to the shared references. */
  shared?: readonly string[]
  /** Guest cwd; must be inside a bound directory. Defaults to the workspace. */
  cwd?: string
  env?: Record<string, string>
  shell?: string
}

/**
 * The bwrap argv for one command.
 *
 * `--unshare-user` first: without a user namespace bwrap needs real
 * CAP_SYS_ADMIN, and `--uid 0 --gid 0` maps us to root inside it so the
 * workspace bind is writable whatever the container runs as.
 *
 * `--unshare-net` is the one that matters most. The API container can reach
 * Postgres, S3, Clerk and the model provider; the shell it spawns must reach
 * nothing. It is also what stops `npx playwright install` and `curl
 * huggingface.co` — the two things a stuck agent reaches for before it starts
 * inventing data.
 *
 * /usr is bound read-only and /bin, /lib, /sbin are symlinks into it, which is
 * the merged-/usr layout of the Debian base image. /etc is NOT bound wholesale
 * — only passwd and group, so the shell has a name and nothing else leaks.
 */
export function bwrapArgs(options: BwrapOptions): string[] {
  const {
    workspace,
    shared = SHARED_ROOTS,
    cwd = workspace,
    env = sandboxEnv(workspace),
    shell = '/bin/bash',
  } = options
  const args = [
    '--unshare-user',
    '--unshare-net',
    '--unshare-ipc',
    '--unshare-uts',
    '--uid',
    '0',
    '--gid',
    '0',
    '--die-with-parent',
    '--new-session',
    '--clearenv',
    // A merged-/usr root, read-only.
    '--ro-bind',
    '/usr',
    '/usr',
    '--symlink',
    'usr/bin',
    '/bin',
    '--symlink',
    'usr/sbin',
    '/sbin',
    '--symlink',
    'usr/lib',
    '/lib',
    '--symlink',
    'usr/lib64',
    '/lib64',
    '--ro-bind-try',
    '/etc/passwd',
    '/etc/passwd',
    '--ro-bind-try',
    '/etc/group',
    '/etc/group',
    '--ro-bind-try',
    '/etc/ssl/certs',
    '/etc/ssl/certs',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
    // The project, and the shared references, each where it already is.
    '--bind',
    workspace,
    workspace,
  ]
  for (const root of shared) args.push('--ro-bind-try', root, root)
  for (const [key, value] of Object.entries(env)) args.push('--setenv', key, value)
  args.push('--chdir', cwd, shell)
  return args
}

/** The argv to run one shell command in the sandbox. */
export function bwrapCommand(command: string, options: BwrapOptions): string[] {
  return [...bwrapArgs(options), '-lc', command]
}

/**
 * The same command with no namespace around it — macOS. The environment is
 * still built from scratch (no API keys), but PATH and HOME come from the host
 * so node, python and Homebrew's tools resolve.
 */
export function unconfinedCommand(
  command: string,
  options: BwrapOptions,
  hostEnv: NodeJS.ProcessEnv = process.env,
): { file: string; args: string[]; cwd: string; env: Record<string, string> } {
  const { workspace, cwd = workspace, env = sandboxEnv(workspace), shell = '/bin/bash' } = options
  return {
    file: shell,
    args: ['-lc', command],
    cwd,
    env: {
      ...env,
      ...(hostEnv.PATH ? { PATH: hostEnv.PATH } : {}),
      ...(hostEnv.HOME ? { HOME: hostEnv.HOME } : {}),
      STUDIO_SANDBOX: 'none',
    },
  }
}

/**
 * What a failed `bwrap` is trying to tell you.
 *
 * Every one of these is the container's own confinement, not the sandbox's
 * configuration, and the fix is a docker-compose setting — so say which.
 */
export function explainBwrapFailure(stderr: string): string | null {
  const s = stderr.toLowerCase()
  if (
    s.includes('no permissions to create a new namespace') ||
    s.includes('does not allow non-privileged user namespaces') ||
    s.includes('creating new namespace failed')
  ) {
    return (
      "the container may not create a user namespace. Docker's default seccomp profile blocks it: " +
      'add `security_opt: [seccomp:unconfined]` to the api service, or enable unprivileged user ' +
      'namespaces on the host (sysctl kernel.unprivileged_userns_clone=1).'
    )
  }
  if (
    s.includes('failed to make / slave') ||
    s.includes('pivot_root') ||
    s.includes("can't mount")
  ) {
    return (
      "the container may not mount. That is AppArmor's docker-default profile: add " +
      '`security_opt: [apparmor:unconfined]` (and, on some kernels, `cap_add: [SYS_ADMIN]`) to the api service.'
    )
  }
  if (s.includes('rtm_newaddr')) {
    return (
      "the container may not configure the sandbox's loopback interface — it needs CAP_NET_ADMIN inside " +
      'the new user namespace. Add `cap_add: [SYS_ADMIN]` to the api service.'
    )
  }
  // Only bwrap's OWN absence — a plain `node: command not found` from the
  // agent's command must not be reported as a broken sandbox.
  if (s === 'enoent' || /bwrap[^\n]*(not found|no such file)/.test(s)) {
    return 'bwrap is not installed. It comes from the `bubblewrap` package (Dockerfile.base).'
  }
  return null
}

// ── Running a command ─────────────────────────────────────────────────────────

export interface SandboxExecOptions {
  onData: (chunk: Buffer) => void
  signal?: AbortSignal
  /** Seconds. */
  timeout?: number
  spawnFn?: typeof import('node:child_process').spawn
  bwrap?: string
  /** Defaults to `sandboxMode()` — bwrap on Linux, unconfined on macOS. */
  mode?: SandboxMode
}

/**
 * Run one command in the sandbox, streaming its output.
 *
 * `onData` is handed BYTES, never a string. pi's bash tool feeds what it
 * receives straight to a TextDecoder, so a string throws
 * ERR_INVALID_ARG_TYPE deep inside the tool — an uncaught exception that
 * takes the whole studio process down. The first bash call an agent made
 * killed the API this way.
 *
 * A sandbox that will not start is a hard failure, never a fall back to
 * running unconfined: this process holds every API key the product has. The
 * unconfined mode is decided up front by the platform (macOS has no bwrap),
 * never by a failure.
 */
export async function runInSandbox(
  command: string,
  options: BwrapOptions & SandboxExecOptions,
): Promise<{ exitCode: number }> {
  const {
    onData,
    signal,
    timeout,
    spawnFn,
    bwrap = 'bwrap',
    mode = sandboxMode(),
    ...bwrapOptions
  } = options
  if (signal?.aborted) throw new Error('aborted')
  const spawn = spawnFn ?? (await import('node:child_process')).spawn
  const confined = mode === 'bwrap'
  const plain = confined ? null : unconfinedCommand(command, bwrapOptions)
  const argv = confined
    ? bwrapCommand(command, bwrapOptions)
    : (plain as NonNullable<typeof plain>).args

  return await new Promise<{ exitCode: number }>((resolve, reject) => {
    const child = confined
      ? spawn(bwrap, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(plain!.file, argv, {
          cwd: plain!.cwd,
          env: plain!.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
    let stderrHead = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    function onAbort() {
      child.kill('SIGKILL')
      finish(() => reject(new Error('aborted')))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (timeout && timeout > 0) {
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`timeout:${timeout}`)))
      }, timeout * 1000)
    }

    child.stdout?.on('data', (chunk: Buffer) => onData(chunk))
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrHead.length < 2000) stderrHead += chunk.toString()
      onData(chunk)
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (!confined)
        return finish(() => reject(new Error(`the shell could not start: ${String(err)}`)))
      const why = explainBwrapFailure(String(err.code ?? err))
      finish(() => reject(new Error(`the sandbox could not start: ${why ?? String(err)}`)))
    })
    child.on('close', (code: number | null) => {
      // bwrap prints its own diagnosis and exits before the command ever runs.
      const why = confined && code !== 0 ? explainBwrapFailure(stderrHead) : null
      if (why) finish(() => reject(new Error(`the sandbox could not start: ${why}`)))
      else finish(() => resolve({ exitCode: code ?? 0 }))
    })
  })
}
