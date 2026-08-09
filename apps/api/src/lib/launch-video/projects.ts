import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { PROJECTS_DIR, RENDERS_DIR, toInternalName, toPublicName } from './paths.js'

const logger = createLogger('api:launch-video')

export interface Scene {
  id: string
  index: number
  start: number
  end: number
  dur: number
  vo: string | null
  /** URL of a per-scene draft render, if one exists */
  draftUrl: string | null
}

export interface ProjectInfo {
  name: string
  hasVideo: boolean
  /** URL of the best available full render (launch preferred, else draft) */
  videoUrl: string | null
  sceneCount: number
}

export interface ProjectDetail extends ProjectInfo {
  scenes: Scene[]
  duration: number
}

function naturalSceneOrder(a: string, b: string): number {
  const na = Number.parseInt(a.replace(/\D/g, ''), 10)
  const nb = Number.parseInt(b.replace(/\D/g, ''), 10)
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
  return na - nb
}

function renderUrl(file: string): string {
  return `/launch-video/files/videos/${encodeURIComponent(file)}`
}

/** Parse window.SCENE_TIMING out of the project's js/timing.js. */
async function readSceneTiming(
  internal: string,
): Promise<Record<string, { dur?: number; vo?: string | null; voDur?: number }>> {
  const timingPath = path.join(PROJECTS_DIR, internal, 'js', 'timing.js')
  if (!existsSync(timingPath)) return {}
  const src = await readFile(timingPath, 'utf8')
  try {
    // timing.js only assigns a plain object literal to window.SCENE_TIMING.
    const fn = new Function('window', `"use strict";\n${src}\n;return window.SCENE_TIMING ?? {};`)
    return (fn({}) as Record<string, { dur?: number; vo?: string | null }>) ?? {}
  } catch (err) {
    logger.warn({ err, timingPath }, 'failed to parse timing.js')
    return {}
  }
}

/**
 * Get one of the user's projects by its public name. All on-disk paths use the
 * namespaced internal name (`<userId>--<name>`); the response carries the
 * public name only.
 */
export async function getProject(userId: string, name: string): Promise<ProjectDetail | null> {
  const internal = toInternalName(userId, name)
  const dir = path.join(PROJECTS_DIR, internal)
  if (!existsSync(dir)) return null

  const launch = `${internal}-launch.mp4`
  const draft = `${internal}-draft.mp4`
  const hasLaunch = existsSync(path.join(RENDERS_DIR, launch))
  const hasDraft = existsSync(path.join(RENDERS_DIR, draft))
  const videoUrl = hasLaunch ? renderUrl(launch) : hasDraft ? renderUrl(draft) : null

  const timing = await readSceneTiming(internal)
  const scenes: Scene[] = []
  let t = 0
  let index = 0
  for (const id of Object.keys(timing).sort(naturalSceneOrder)) {
    index += 1
    const dur = Number(timing[id]?.dur) || 0
    const sceneDraft = `${internal}-s${index}-draft.mp4`
    scenes.push({
      id,
      index,
      start: t,
      end: t + dur,
      dur,
      vo: timing[id]?.vo ?? null,
      draftUrl: existsSync(path.join(RENDERS_DIR, sceneDraft)) ? renderUrl(sceneDraft) : null,
    })
    t += dur
  }

  return {
    name,
    hasVideo: videoUrl !== null,
    videoUrl,
    sceneCount: scenes.length,
    scenes,
    duration: t,
  }
}

/** List only the requesting user's projects (dirs prefixed `<userId>--`). */
export async function listProjects(userId: string): Promise<ProjectInfo[]> {
  if (!existsSync(PROJECTS_DIR)) return []
  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true })
  const out: ProjectInfo[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === '_archive') continue
    const publicName = toPublicName(userId, e.name)
    if (!publicName) continue
    const p = await getProject(userId, publicName)
    if (!p) continue
    out.push({
      name: p.name,
      hasVideo: p.hasVideo,
      videoUrl: p.videoUrl,
      sceneCount: p.sceneCount,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
