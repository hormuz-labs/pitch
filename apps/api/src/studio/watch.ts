/**
 * Workspace watcher: the studio shows each change the moment the agent saves
 * it, instead of waiting for the turn to end.
 *
 * The agent's VM writes straight through to projects/<internal>/ on the host,
 * so a recursive fs.watch on that folder sees every save. Relevant changes are
 * debounced and turned into one SSE event:
 *
 *   { type: "preview", ok, files, ...probe }
 *
 * What counts as relevant and how the workspace is probed (does it compile,
 * how many scenes, …) is decided per flow.
 */
import { existsSync, type FSWatcher, watch } from 'node:fs'
import path from 'node:path'

export interface PreviewProbe {
  ok: boolean
  error: string | null
  /** The flow's fresh description of the workspace. */
  description?: unknown
}

export interface PreviewEvent extends PreviewProbe {
  type: 'preview'
  files: string[]
}

/**
 * Shelf material changed and nothing the preview draws did.
 *
 * Deliberately carries no probe: describing the workspace is the expensive
 * half of a preview event, and it also nudges the player. A harvested logo
 * appearing must not reseek the video the user is watching.
 */
export interface AssetsEvent {
  type: 'assets'
  files: string[]
}

export interface WatchSpec {
  /** Workspace-relative paths whose changes affect what the preview shows. */
  relevant: RegExp
  /** Paths that are material on the asset shelf but change no preview. */
  assets: RegExp
  probe: (dir: string) => Promise<PreviewProbe>
  debounceMs?: number
}

/** Scratch, caches and backups the tools write while working. */
const IGNORE = /(^|\/)\.[^/]+$|\.bak$|\.pcm$|\.tmp$|~$/

interface Watch {
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
  pending: Set<string>
}

const watches = new Map<string, Watch>()

export function watchWorkspace(
  dir: string,
  spec: WatchSpec,
  emit: (ev: PreviewEvent | AssetsEvent) => void,
): void {
  if (watches.has(dir)) return
  if (!existsSync(dir)) return

  let watcher: FSWatcher
  try {
    watcher = watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = String(filename).replace(/\\/g, '/')
      if (IGNORE.test(rel)) return
      if (!spec.relevant.test(rel) && !spec.assets.test(rel)) return
      const w = watches.get(dir)
      if (!w) return
      w.pending.add(rel)
      if (w.timer) clearTimeout(w.timer)
      w.timer = setTimeout(() => void flush(dir, spec, emit), spec.debounceMs ?? 500)
    })
  } catch (err) {
    console.warn(`[studio:watch] cannot watch ${dir}:`, err)
    return
  }
  watcher.on('error', err => {
    console.warn(`[studio:watch] ${path.basename(dir)}:`, err)
    unwatchWorkspace(dir)
  })
  watches.set(dir, { watcher, timer: null, pending: new Set() })
}

export function unwatchWorkspace(dir: string): void {
  const w = watches.get(dir)
  if (!w) return
  if (w.timer) clearTimeout(w.timer)
  w.watcher.close()
  watches.delete(dir)
}

async function flush(dir: string, spec: WatchSpec, emit: (ev: PreviewEvent | AssetsEvent) => void) {
  const w = watches.get(dir)
  if (!w) return
  const files = [...w.pending].sort()
  w.pending.clear()
  w.timer = null

  // A preview event re-describes the workspace and reloads the stage, so it is
  // only for changes the stage actually shows. A batch of pure shelf writes
  // gets the cheap event instead.
  if (!files.some(f => spec.relevant.test(f))) {
    emit({ type: 'assets', files })
    return
  }
  const probe = await spec.probe(dir)
  emit({ type: 'preview', files, ...probe })
}
