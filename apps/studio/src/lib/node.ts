import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * The skill scripts (capture.mjs, mix.mjs, …) are plain Node programs. The
 * API may run under Bun, so prefer a real `node` on PATH and fall back to the
 * current runtime only when none is installed. Override with STUDIO_NODE.
 */
let cached: string | null = null

function findNode(): string {
  if (process.env.STUDIO_NODE) return process.env.STUDIO_NODE
  if (/\/node$/.test(process.execPath)) return process.execPath
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir && existsSync(path.join(dir, 'node'))) return path.join(dir, 'node')
  }
  return process.execPath
}

export function nodeBinary(): string {
  if (!cached) cached = findNode()
  return cached
}
