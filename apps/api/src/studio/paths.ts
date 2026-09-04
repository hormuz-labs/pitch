/**
 * Where project workspaces live and how they are named.
 *
 *   launch-video   projects/<userId>--<name>/          (the historical layout —
 *                                                       the prod volume already
 *                                                       holds these)
 *   other flows    projects/<flow>--<userId>--<name>/
 *
 * The `<userId>--` segment is the per-user isolation boundary: file routes and
 * directory listings check it; clients only ever see project ids and names.
 *
 * The directories themselves come from .pi/lib/paths.ts, which the host tools
 * and the sandbox share: one answer for where the engine, skills, assets and
 * projects are, so the API and the agent never disagree about a path.
 */
import path from 'node:path'

export {
  ASSETS_DIR,
  ENGINE_DIR,
  EXTENSIONS_DIR as PI_EXTENSIONS_DIR,
  MUSIC_DIR,
  PI_DIR,
  PROJECTS_DIR,
  REPO_ROOT as ROOT_DIR,
  SFX_DIR,
  SKILLS_DIR,
} from '../../../../.pi/lib/paths.ts'

import { PROJECTS_DIR, SKILLS_DIR } from '../../../../.pi/lib/paths.ts'

export const MOTION_SKILL_DIR = path.join(SKILLS_DIR, 'launch-video')

/**
 * Only a directory-naming key now. New projects are all 'studio'; the four old
 * values survive because the workspaces they name are already on disk.
 */
export type FlowId = 'studio' | 'launch-video' | 'demo-video' | 'deck' | 'recording-edit'
export const FLOW_IDS: FlowId[] = ['studio', 'launch-video', 'demo-video', 'deck', 'recording-edit']
export function isFlowId(v: unknown): v is FlowId {
  return typeof v === 'string' && (FLOW_IDS as string[]).includes(v)
}

export interface Workspace {
  flow: FlowId
  userId: string
  /** Project name (slug); the last segment of the directory name. */
  name: string
  /** Directory basename under projects/. */
  internal: string
  /** Absolute workspace directory. */
  dir: string
}

/** Project names are single path segments; nothing that could escape projects/. */
export function isValidProjectName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 120 &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(name) &&
    !name.includes('--') &&
    name !== '.' &&
    name !== '..'
  )
}

/** Slug for a new project from free text (host, topic, file name…). */
export function slugify(text: string, fallback = 'project'): string {
  const stripped = text.replace(/https?:\/\/[^\s)]+/g, m => {
    try {
      return new URL(m).hostname.replace(/^www\./, '')
    } catch {
      return ' '
    }
  })
  const STOP = new Set([
    'the',
    'for',
    'and',
    'with',
    'from',
    'that',
    'this',
    'have',
    'has',
    'was',
    'are',
    'you',
    'your',
    'make',
    'create',
    'build',
    'video',
    'https',
    'http',
    'com',
    'org',
    'net',
    'html',
    'www',
    'please',
    'want',
    'need',
    'about',
  ])
  const words = stripped
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\./g, '-')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .slice(0, 4)
  const slug = words.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return slug || fallback
}

export function internalName(flow: FlowId, userId: string, name: string): string {
  return flow === 'launch-video' ? `${userId}--${name}` : `${flow}--${userId}--${name}`
}

export function workspaceFor(flow: FlowId, userId: string, name: string): Workspace {
  const internal = internalName(flow, userId, name)
  return { flow, userId, name, internal, dir: path.join(PROJECTS_DIR, internal) }
}

/** Inverse of internalName; null for directories that are not project workspaces. */
export function parseInternal(internal: string): Workspace | null {
  const parts = internal.split('--')
  if (parts.length === 2) {
    const [userId, name] = parts
    if (!userId || !name) return null
    return { flow: 'launch-video', userId, name, internal, dir: path.join(PROJECTS_DIR, internal) }
  }
  if (parts.length === 3 && isFlowId(parts[0]) && parts[0] !== 'launch-video') {
    const [flow, userId, name] = parts
    if (!userId || !name) return null
    return { flow: flow as FlowId, userId, name, internal, dir: path.join(PROJECTS_DIR, internal) }
  }
  return null
}

/** True when `internal` belongs to `userId` (the isolation check for file routes). */
export function ownsInternal(userId: string, internal: string): boolean {
  const ws = parseInternal(internal)
  return ws !== null && ws.userId === userId
}

/** URL of a workspace file as served by /files/projects. */
export function fileUrl(internal: string, rel: string): string {
  return `/files/projects/${encodeURIComponent(internal)}/${rel.split('/').map(encodeURIComponent).join('/')}`
}
