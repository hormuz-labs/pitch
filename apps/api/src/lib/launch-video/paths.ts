import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Repo root (pitch/). Works from both src (bun --watch) and the compiled
 * dist/ output since both keep the same directory depth:
 * apps/api/{src,dist}/lib/launch-video -> up 5 levels.
 */
export const ROOT_DIR = path.resolve(__dirname, '../../../../..')
export const PROJECTS_DIR = path.join(ROOT_DIR, 'projects')
export const RENDERS_DIR = path.join(ROOT_DIR, 'renders')
export const MUSIC_DIR = path.join(ROOT_DIR, 'music')
export const SFX_DIR = path.join(ROOT_DIR, 'sfx')

/**
 * Per-user namespacing: every project's on-disk name is `<userId>--<name>`
 * (projects/ dirs, renders/ files, opencode session titles). The API only ever
 * exposes the public `name`, so one user cannot address another user's files.
 */
export function toInternalName(userId: string, publicName: string): string {
  return `${userId}--${publicName}`
}

/** Strip the user's prefix; null if the internal name belongs to someone else. */
export function toPublicName(userId: string, internal: string): string | null {
  const prefix = `${userId}--`
  return internal.startsWith(prefix) ? internal.slice(prefix.length) : null
}
