/**
 * The curated background-music library (assets/music/). The studio's picker
 * and the agent's motion_find_audio read the same folder. Nothing is ever
 * auto-imported from personal directories.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { MUSIC_DIR, type Workspace } from '../studio/paths.js'

const execFileP = promisify(execFile)
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'])

export interface MusicTrack {
  name: string
  file: string
  url: string
  duration: number | null
}

const durationCache = new Map<string, number | null>()

async function probeDuration(file: string): Promise<number | null> {
  if (durationCache.has(file)) return durationCache.get(file)!
  let dur: number | null = null
  try {
    const { stdout } = await execFileP('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path.join(MUSIC_DIR, file),
    ])
    const n = Number.parseFloat(stdout.trim())
    dur = Number.isFinite(n) ? Math.round(n) : null
  } catch {
    // ffprobe unavailable or unreadable — leave null
  }
  durationCache.set(file, dur)
  return dur
}

export function musicUrl(file: string): string {
  return `/files/music/${encodeURIComponent(file)}`
}

/** Replace the workspace's canonical bed without exposing a partially copied file. */
export async function stageMusic(ws: Workspace, music: string): Promise<string | null> {
  const file = path.basename(music)
  if (!AUDIO_EXT.has(path.extname(file).toLowerCase())) return null
  let src: string
  if (music.startsWith('uploads/')) {
    // Personal tracks are addressed by their workspace path, never a host path.
    const root = await realpath(path.join(ws.dir, 'uploads')).catch(() => null)
    const resolved = await realpath(path.resolve(ws.dir, music)).catch(() => null)
    if (!root || !resolved?.startsWith(`${root}${path.sep}`)) return null
    src = resolved
  } else {
    src = path.join(MUSIC_DIR, file)
  }
  if (!existsSync(src)) return null
  const audioDir = path.join(ws.dir, 'audio')
  const destination = `music${path.extname(file).toLowerCase()}`
  const temporary = path.join(audioDir, `.${destination}.${process.pid}.tmp`)
  await mkdir(audioDir, { recursive: true })
  await copyFile(src, temporary)
  await rename(temporary, path.join(audioDir, destination))
  await Promise.all(
    (await readdir(audioDir))
      .filter(name => /^music\.[a-z0-9]+$/i.test(name) && name !== destination)
      .map(name => rm(path.join(audioDir, name), { force: true })),
  )
  return destination
}

export async function listMusic(): Promise<MusicTrack[]> {
  if (!existsSync(MUSIC_DIR)) return []
  const entries = await readdir(MUSIC_DIR, { withFileTypes: true })
  const files = entries
    .filter(e => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b))
  return Promise.all(
    files.map(async file => ({
      name: path.basename(file, path.extname(file)),
      file,
      url: musicUrl(file),
      duration: await probeDuration(file),
    })),
  )
}
