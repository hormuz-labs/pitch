import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createLogger } from '@saas/shared'
import { MUSIC_DIR, SFX_DIR } from './paths.js'

const logger = createLogger('api:launch-video')

const execFileP = promisify(execFile)
// Auto-import source for user-dropped audio. Override with LAUNCH_VIDEO_IMPORT_DIR
// (e.g. disable/point elsewhere in production); defaults to ~/Downloads.
const DOWNLOADS_DIR = process.env.LAUNCH_VIDEO_IMPORT_DIR ?? path.join(homedir(), 'Downloads')
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'])
/** Files smaller than this are treated as SFX, not music beds. */
const SFX_MAX_BYTES = 500_000

export interface MusicTrack {
  name: string
  file: string
  url: string
  duration: number | null
}

/** "verclub_music-background-music-571037" -> "verclub-571037" */
function cleanName(base: string): string {
  return base
    .replace(/_/g, '-')
    .toLowerCase()
    .replace(/background-music/g, '')
    .replace(/-music-/g, '-')
    .replace(/-for-video/g, '')
    .replace(/-second/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Auto-import audio dropped in ~/Downloads: music beds (>=500KB) into
 * assets/music/, short clips into assets/sfx/. Copies (originals stay in
 * Downloads), skips existing.
 */
export async function importFromDownloads(): Promise<void> {
  if (!existsSync(DOWNLOADS_DIR)) return
  let entries
  try {
    entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (!e.isFile()) continue
    const ext = path.extname(e.name).toLowerCase()
    if (!AUDIO_EXT.has(ext)) continue
    const src = path.join(DOWNLOADS_DIR, e.name)
    try {
      const { size } = await stat(src)
      const dir = size >= SFX_MAX_BYTES ? MUSIC_DIR : SFX_DIR
      const dest = path.join(dir, cleanName(path.basename(e.name, ext)) + ext)
      if (existsSync(dest)) continue
      await copyFile(src, dest)
      logger.info({ src: e.name, dest }, 'imported audio from Downloads')
    } catch {
      // skip unreadable files
    }
  }
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

/** List the background-music library (assets/music/). */
export async function listMusic(): Promise<MusicTrack[]> {
  await importFromDownloads()
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
      url: `/launch-video/files/music/${encodeURIComponent(file)}`,
      duration: await probeDuration(file),
    })),
  )
}
