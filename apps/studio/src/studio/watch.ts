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

export interface WatchSpec {
  /** Workspace-relative paths whose changes affect what the preview shows. */
  relevant: RegExp
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
  emit: (ev: PreviewEvent) => void,
): void {
  if (watches.has(dir)) return
  if (!existsSync(dir)) return

  let watcher: FSWatcher
  try {
    watcher = watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = String(filename).replace(/\\/g, '/')
      if (IGNORE.test(rel) || !spec.relevant.test(rel)) return
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

async function flush(dir: string, spec: WatchSpec, emit: (ev: PreviewEvent) => void) {
  const w = watches.get(dir)
  if (!w) return
  const files = [...w.pending].sort()
  w.pending.clear()
  w.timer = null
  const probe = await spec.probe(dir)
  emit({ type: 'preview', files, ...probe })
}
