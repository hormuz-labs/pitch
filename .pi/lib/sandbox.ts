/**
 * The studio sandbox: bubblewrap.
 *
 * The agent's shell runs inside the API container, which holds every secret
 * the product has — Clerk, Dodo, S3, Gemini, the database URL — and a
 * projects/ volume containing every user's workspace. So `bash` gets a mount
 * namespace of its own: this project's folder read-write, the three shared
 * references read-only, and nothing else. No network, no host environment.
 *
 * This replaces a Gondolin micro-VM. The VM was correct but expensive: a KVM
 * guest per session, qemu in the image, and a re-implementation of read,
 * write, edit, ls, find and grep against its virtual filesystem. Only ONE tool
 * ever needed the isolation. The file tools are plain host filesystem access,
 * and one path check (`toHostPath` below) is the whole of their security — the
 * same check html-motion-tools.ts already applies to its own arguments.
 *
 * Everything here is pure: argv construction and path resolution, so it can be
 * tested anywhere. `bwrap` itself only exists on Linux.
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'

export const GUEST_WORKSPACE = '/workspace'

/**
 * Guest path → host path. The agent sees /workspace and the same
 * ../../engine, ../../.pi/skills and ../../assets the skills have always
 * named, so nothing it reads has to change.
 */
export type SharedMounts = Record<string, string>

export class SandboxPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SandboxPathError'
  }
}

const toPosix = (value: string) => value.split(path.sep).join(path.posix.sep)

/**
 * Resolve a path the agent named to a real host path, or refuse.
 *
 * Relative paths resolve against the workspace, so `../../engine/schema.md`
 * lands on the read-only engine mount exactly as it does inside the shell.
 * Absolute paths must name a mount. Everything else — /app/.env, another
 * project, /etc/shadow — is refused, and writes are refused anywhere but the
 * workspace.
 */
export function toHostPath(
  workspace: string,
  shared: SharedMounts,
  input: string,
  mode: 'read' | 'write' = 'read',
): string {
  const trimmed = toPosix(String(input ?? '').trim()).replace(/^@/, '')
  if (!trimmed) return workspace

  let host: string
  if (path.posix.isAbsolute(trimmed)) {
    const guest = path.posix.normalize(trimmed)
    if (guest === GUEST_WORKSPACE || guest.startsWith(`${GUEST_WORKSPACE}/`)) {
      host = path.resolve(workspace, `.${guest.slice(GUEST_WORKSPACE.length)}`)
    } else {
      const mount = Object.keys(shared)
        .sort((a, b) => b.length - a.length)
        .find(g => guest === g || guest.startsWith(`${g}/`))
      if (!mount) {
        throw new SandboxPathError(
          `${input} is outside this project. You can reach ${GUEST_WORKSPACE} (your workspace) ` +
            `and ${Object.keys(shared).sort().join(', ')} (read-only) — nothing else on this machine.`,
        )
      }
      host = path.resolve(shared[mount], `.${guest.slice(mount.length)}`)
    }
  } else {
    host = path.resolve(workspace, trimmed)
  }

  // Resolve symlinks before deciding. Comparing the LEXICAL path is not a
  // boundary: the shell can create a link inside its own workspace pointing
  // anywhere on the host — `ln -s /app/.env notes.md` — and the link's target
  // is dangling inside the sandbox but perfectly real to a file tool running
  // out here. Without this the guard says "notes.md, inside the workspace" and
  // the read returns CLERK_SECRET_KEY.
  const real = resolveSymlinks(host)
  const inWorkspace = contains(resolveSymlinks(workspace), real)
  if (!inWorkspace) {
    const readable = Object.values(shared).some(root => contains(resolveSymlinks(root), real))
    if (!readable) {
      throw new SandboxPathError(
        `${input} leads outside this project. Your workspace is ${GUEST_WORKSPACE}, and a link ` +
          `out of it is still outside it.`,
      )
    }
    if (mode === 'write') {
      throw new SandboxPathError(
        `${input} is on a read-only shared mount — write inside ${GUEST_WORKSPACE}.`,
      )
    }
  }
  return host
}

/**
 * The path with every symlink in it resolved.
 *
 * A path being written does not exist yet, and neither may its parents, so
 * resolve the deepest ancestor that does exist and re-attach the rest: a
 * symlink can only hide in a component that is already there.
 */
export function resolveSymlinks(target: string): string {
  let head = target
  const tail: string[] = []
  for (;;) {
    try {
      return tail.length ? path.join(realpathSync.native(head), ...tail) : realpathSync.native(head)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return path.resolve(target)
      const parent = path.dirname(head)
      if (parent === head) return path.resolve(target)
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

/** Host path → the guest path the agent knows it by, for messages it reads. */
export function toGuestPath(workspace: string, shared: SharedMounts, host: string): string {
  if (contains(workspace, host)) {
    const rel = path.relative(workspace, host)
    return rel ? path.posix.join(GUEST_WORKSPACE, toPosix(rel)) : GUEST_WORKSPACE
  }
  for (const [guest, root] of Object.entries(shared)) {
    if (contains(root, host)) {
      const rel = path.relative(root, host)
      return rel ? path.posix.join(guest, toPosix(rel)) : guest
    }
  }
  return toPosix(host)
}

export function contains(root: string, child: string): boolean {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * The guest's whole environment. Never the host's: that is where the API keys
 * are, and an agent that can read process.env has read every secret.
 */
export function sandboxEnv(term = 'xterm'): Record<string, string> {
  return {
    HOME: '/root',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    TERM: term,
    LANG: 'C.UTF-8',
    PWD: GUEST_WORKSPACE,
    STUDIO_SANDBOX: 'bwrap',
  }
}

export interface BwrapOptions {
  workspace: string
  shared: SharedMounts
  /** Guest cwd; must be inside a mount. Defaults to the workspace. */
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
    shared,
    cwd = GUEST_WORKSPACE,
    env = sandboxEnv(),
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
    // The project, and the shared references at the paths the skills name.
    '--bind',
    workspace,
    GUEST_WORKSPACE,
  ]
  for (const [guest, host] of Object.entries(shared)) {
    args.push('--ro-bind', host, guest)
  }
  for (const [key, value] of Object.entries(env)) args.push('--setenv', key, value)
  args.push('--chdir', cwd, shell)
  return args
}

/** The argv to run one shell command in the sandbox. */
export function bwrapCommand(command: string, options: BwrapOptions): string[] {
  return [...bwrapArgs(options), '-lc', command]
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
