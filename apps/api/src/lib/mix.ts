/**
 * Safety net for the audio mix. The agent is supposed to end its build with
 * motion_mix, but a turn can die halfway (a restart, an abort, a model that
 * stops after a tool call). Without audio/mix.wav the export is silent and
 * the preview plays whatever file sorts first in audio/.
 *
 * ensureMix() builds (or refreshes) audio/mix.wav from what the workspace
 * already holds — the continuous narration named in shots.js `audio.vo`, the
 * music bed, the SFX bus if one was built — by running the skill's own
 * mix.mjs, so the result is the same deterministic mixdown the agent would
 * have produced. It is a no-op when the mix is newer than all its inputs.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { MOTION_SCRIPTS_DIR } from '../studio/paths.js'
import { nodeBinary } from './node.js'

const logger = createLogger('launch-video')
const MIX_SCRIPT = path.join(MOTION_SCRIPTS_DIR, 'mix.mjs')
const MUSIC_RE = /\.(mp3|m4a|aac|ogg|flac|wav)$/i
/** Files in audio/ that are never a music bed. */
const NOT_A_BED = /^(mix|vo|vo[_-].*|vo-alt.*|sfx_bus|.*_bus|voice_sfx|cues|sfx-cues)\.\w+$/i

export interface MixResult {
  built: boolean
  reason: string
  /** Last lines of mix.mjs output, when it ran. */
  log?: string
}

const inflight = new Map<string, Promise<MixResult>>()

function mtime(p: string): number {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}

/** Pick the bed: audio/music.* first, else the newest non-narration audio file. */
function findBed(audioDir: string): string | null {
  if (!existsSync(audioDir)) return null
  const files = readdirSync(audioDir).filter(
    f => !f.startsWith('.') && MUSIC_RE.test(f) && !NOT_A_BED.test(f),
  )
  const named = files.find(f => /^music\./i.test(f))
  if (named) return named
  return (
    files.sort((a, b) => mtime(path.join(audioDir, b)) - mtime(path.join(audioDir, a)))[0] ?? null
  )
}

async function readSpec(
  dir: string,
): Promise<{ duration: number; vo: string | null; starts: number[] } | null> {
  const shotsPath = path.join(dir, 'shots.js')
  if (!existsSync(shotsPath)) return null
  try {
    const src = await readFile(shotsPath, 'utf8')
    const fn = new Function('window', `"use strict";\n${src}\n;return window.SHOTS ?? null;`)
    const spec = fn({}) as {
      shots?: Array<{ dur?: number; vo?: unknown }>
      audio?: { vo?: unknown }
    } | null
    if (!spec || !Array.isArray(spec.shots)) return null
    const starts: number[] = []
    let duration = 0
    for (const s of spec.shots) {
      starts.push(duration)
      duration += Number(s.dur) || 0
    }
    // One continuous read (audio.vo) is the contract; legacy projects carry a
    // clip per shot, which mix.mjs still places from the summed durations.
    const vo =
      typeof spec.audio?.vo === 'string'
        ? spec.audio.vo
        : spec.shots.some(s => typeof s.vo === 'string')
          ? 'per-shot'
          : null
    return { duration, vo, starts }
  } catch {
    return null
  }
}

function run(args: string[], cwd: string): Promise<{ code: number | null; out: string }> {
  return new Promise(resolve => {
    const proc = spawn(nodeBinary(), [MIX_SCRIPT, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    proc.stdout?.on('data', (c: Buffer) => {
      out += c.toString('utf8')
    })
    proc.stderr?.on('data', (c: Buffer) => {
      out += c.toString('utf8')
    })
    proc.on('error', err => resolve({ code: null, out: `${out}\n${err.message}` }))
    proc.on('close', code => resolve({ code, out }))
  })
}

/**
 * Build audio/mix.wav if it is missing or older than its inputs. Serialized
 * per workspace; concurrent callers share one run.
 */
export function ensureMix(dir: string): Promise<MixResult> {
  const pending = inflight.get(dir)
  if (pending) return pending
  const p = ensureMixNow(dir).finally(() => inflight.delete(dir))
  inflight.set(dir, p)
  return p
}

async function ensureMixNow(dir: string): Promise<MixResult> {
  if (!existsSync(path.join(dir, 'index.html')))
    return { built: false, reason: 'no index.html yet' }
  if (!existsSync(MIX_SCRIPT)) return { built: false, reason: 'mix.mjs not found' }
  const spec = await readSpec(dir)
  if (!spec || spec.duration <= 0) return { built: false, reason: 'shots.js does not evaluate' }

  const audioDir = path.join(dir, 'audio')
  let vo =
    spec.vo === 'per-shot'
      ? 'per-shot'
      : spec.vo && existsSync(path.join(dir, spec.vo))
        ? spec.vo
        : null
  // Oldest layout: audio/vo_scene3.wav style clips with nothing in shots.js
  // pointing at them. Map clip N onto shot N's start and hand mix.mjs a vo-map.
  let voMap: string | null = null
  const numberedClips = existsSync(audioDir)
    ? readdirSync(audioDir)
        .filter(f => /^vo[_-]?(scene)?[_-]?\d+\.wav$/i.test(f))
        .map(f => ({ f, n: Number(/(\d+)\.wav$/i.exec(f)?.[1]) }))
        .filter(c => Number.isFinite(c.n))
        .sort((a, b) => a.n - b.n)
    : []
  if (!vo && numberedClips.length) {
    const map = numberedClips
      .filter(c => c.n >= 1 && c.n <= spec.starts.length)
      .map(c => ({ file: `audio/${c.f}`, t: +(spec.starts[c.n - 1] + 0.12).toFixed(3) }))
    if (map.length) {
      voMap = 'audio/vo-map.auto.json'
      await writeFile(path.join(dir, voMap), JSON.stringify(map, null, 2))
      vo = 'per-shot'
    }
  }
  const bed = findBed(audioDir)
  if (!vo && !bed) return { built: false, reason: 'no narration and no music bed in audio/' }

  const sfx = existsSync(path.join(audioDir, 'sfx_bus.wav')) ? 'audio/sfx_bus.wav' : null
  const voFiles =
    vo === 'per-shot'
      ? readdirSync(audioDir)
          .filter(f => /^vo[_-].*\.wav$/i.test(f))
          .map(f => path.join(audioDir, f))
      : vo
        ? [path.join(dir, vo)]
        : []
  const inputs = [
    path.join(dir, 'shots.js'),
    ...voFiles,
    bed ? path.join(audioDir, bed) : '',
    sfx ? path.join(dir, sfx) : '',
  ].filter(Boolean)
  const mixPath = path.join(audioDir, 'mix.wav')
  const newestInput = Math.max(...inputs.map(mtime))
  if (existsSync(mixPath) && mtime(mixPath) >= newestInput) {
    return { built: false, reason: 'mix.wav is up to date' }
  }

  const args = [`--duration=${spec.duration.toFixed(3)}`]
  if (bed) args.push(`--music=audio/${bed}`)
  if (sfx) args.push(`--sfx=${sfx}`)
  if (voMap) args.push(`--vo-map=${voMap}`)
  if (!vo) args.push('--music-only')
  logger.info(
    { workspace: path.basename(dir), vo: Boolean(vo), bed, sfx: Boolean(sfx) },
    'building audio/mix.wav',
  )
  const { code, out } = await run(args, dir)
  const tail = out.trim().split('\n').slice(-12).join('\n')
  const produced = existsSync(mixPath) && mtime(mixPath) >= newestInput
  if (!produced) {
    logger.warn({ workspace: path.basename(dir), code, tail }, 'mix.mjs exited without a mix')
    return { built: false, reason: `mix.mjs exited ${code}`, log: tail }
  }
  if (code !== 0)
    logger.warn({ workspace: path.basename(dir), code }, 'mix built but its gate reported problems')
  return { built: true, reason: code === 0 ? 'built' : `built, gate exit ${code}`, log: tail }
}
