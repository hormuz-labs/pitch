/**
 * Where everything is. The one answer, for the API, the host tools, the
 * sandbox and the skills.
 *
 * There is no guest/host translation. The agent's shell, its file tools and
 * every host tool see the SAME absolute paths: the project's workspace at its
 * real location, and the four shared references (engine, skills, assets,
 * effects) at
 * theirs. The sandbox binds each at the path it already has, so a path in a
 * tool result, a skill listing, an error message or the agent's own `pwd`
 * means one thing everywhere.
 *
 * It used to be otherwise — /workspace, /engine, /.pi/skills and /assets
 * inside the sandbox, mapped to and from the host in three separate places —
 * and the mapping leaked constantly: pi listed skills at their host path, the
 * file tools refused that path, the agent read the same skill twice under two
 * names, and every host tool had to rewrite its output before the agent could
 * use it. One set of paths ends all of that.
 *
 * Every function here is pure apart from symlink resolution, and the roots
 * are derived from this file's own location, so they are right under bun,
 * vitest, jiti and in the container without configuration. PROJECTS_DIR is
 * the only override, and it is the same override the API has always taken.
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const ENGINE_DIR = path.join(REPO_ROOT, 'engine')
export const PI_DIR = path.join(REPO_ROOT, '.pi')
export const EXTENSIONS_DIR = path.join(PI_DIR, 'extensions')
export const SKILLS_DIR = path.join(PI_DIR, 'skills')
/** The Node programs behind the motion_* tools. Host-side only: never on the agent's side of the boundary. */
export const SCRIPTS_DIR = path.join(PI_DIR, 'scripts')
export const ASSETS_DIR = path.join(REPO_ROOT, 'assets')
export const MUSIC_DIR = path.join(ASSETS_DIR, 'music')
export const SFX_DIR = path.join(ASSETS_DIR, 'sfx')
export const EFFECTS_DIR = path.join(REPO_ROOT, 'effects')
export const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(REPO_ROOT, 'projects')

/**
 * Readable by the agent, writable by nobody: mounted read-only in the sandbox
 * and refused for writes by every host tool.
 *
 * The engine is not among them. The agent edits shots.js and reads the
 * engine's contract through `motion_schema`; the compiler and the factories
 * (135KB) are library code it once read four times in one film. The same
 * goes for the vendor libraries under assets/ — see LIBRARY_DIRS.
 */
export const SHARED_ROOTS: readonly string[] = [SKILLS_DIR, ASSETS_DIR, EFFECTS_DIR]

/**
 * Library code inside a shared root that the agent never needs to read:
 * hidden under an empty tmpfs in the sandbox and refused by the file tools.
 * The page loads them; the agent only names them.
 */
export const LIBRARY_DIRS: readonly string[] = [
  path.join(ASSETS_DIR, 'gsap'),
  path.join(ASSETS_DIR, 'three'),
  path.join(ASSETS_DIR, 'rive'),
]

export class PathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathError'
  }
}

/**
 * The workspace a tool call belongs to: the session's cwd, which the studio
 * sets to the project directory. There is deliberately no fallback — a tool
 * that ran against process.cwd() would be operating on the API's own checkout.
 */
export function workspaceOf(ctx: { cwd?: string } | undefined): string {
  const cwd = ctx?.cwd
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new PathError('this tool needs a project workspace and was called without one')
  }
  return path.resolve(cwd)
}

/**
 * A path the agent named, as the real absolute path it may use — or a refusal.
 *
 * Relative paths resolve against the workspace. Absolute paths are taken as
 * they are. Then, with every symlink resolved (a link the shell planted inside
 * the workspace can point anywhere on this machine, and that is exactly what
 * this must catch), the result has to sit inside the workspace, or — for reads
 * only — inside one of the shared references. Everything else is refused:
 * the API's own tree and its .env, another user's project, /etc, /proc.
 */
export function resolveIn(
  workspace: string,
  input: string,
  mode: 'read' | 'write' = 'read',
): string {
  const trimmed = String(input ?? '')
    .trim()
    .replace(/^@/, '')
  const abs = trimmed ? path.resolve(workspace, trimmed) : path.resolve(workspace)

  if (/^\.env(\..*)?$/.test(path.basename(abs))) {
    throw new PathError(`${input} is off limits: secrets are never a tool's input.`)
  }

  const real = resolveSymlinks(abs)
  if (contains(resolveSymlinks(workspace), real)) return abs

  const shared = SHARED_ROOTS.some(root => contains(resolveSymlinks(root), real))
  if (!shared) {
    throw new PathError(
      `${input} is outside this project. You can reach ${workspace} (your workspace) and, ` +
        `read-only, ${SHARED_ROOTS.join(', ')} — nothing else on this machine.`,
    )
  }
  if (mode === 'write') {
    throw new PathError(`${input} is a shared, read-only reference — write inside ${workspace}.`)
  }
  if (LIBRARY_DIRS.some(dir => contains(resolveSymlinks(dir), real))) {
    throw new PathError(
      `${input} is library code the page loads for you — there is nothing in it to read. ` +
        'The engine is described by motion_schema, the effects by motion_effects.',
    )
  }
  return abs
}

/**
 * The same, as the scripts that run with cwd = workspace want it: relative
 * for anything in the workspace, absolute for a shared reference.
 */
export function relativeIn(
  workspace: string,
  input: string,
  mode: 'read' | 'write' = 'read',
): string {
  const abs = resolveIn(workspace, input, mode)
  const rel = path.relative(workspace, abs)
  return rel === '' ? '.' : rel.startsWith('..') ? abs : rel
}

/** The sentence the agent is told about where it is. */
export function describeWorkspace(workspace: string): string {
  return (
    `Current working directory: ${workspace} — this project's workspace, and the only place ` +
    `you can write. Read-only references: your skills at ${SKILLS_DIR}, the music, SFX and ` +
    `font libraries at ${ASSETS_DIR}, the motion effects lab at ${EFFECTS_DIR}. The engine ` +
    `and the vendor libraries are not on disk for you: motion_schema and motion_effects are ` +
    `their reference. Nothing else on this machine exists for you: no other project, ` +
    `no network, no environment.`
  )
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

/** Whether `child` is `root` or inside it, lexically — resolve symlinks first. */
export function contains(root: string, child: string): boolean {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}
