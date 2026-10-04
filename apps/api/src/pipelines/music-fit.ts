/**
 * Fitting a generated music bed to the film: measure where its drops really
 * are, then trim it so one lands on the word the film turns on.
 *
 * No generator keeps the clock of an arrangement it is given. Lyria 3.5,
 * asked for 30s with drops at 3s and 17s, returned 68s with them at 6.5s and
 * 19.75s. ElevenLabs music_v2, given a composition plan with exact section
 * durations, returned exactly 30s but with the drops 0.4s and 2.8s late. So
 * the bed is measured after it arrives — the low end per quarter second, where
 * it vanishes and where it slams back — and, given `dropAt` (the film second
 * of the turn word), the head is trimmed so a measured drop lands exactly
 * there. The tail is cut to the film with a fade; the raw take is kept.
 * The other sections are the mix's job: `thin` windows ending on their words.
 */
import { execFileAsync, getMediaDurationSec } from '../render/media.js'

/** Analysis window: fine enough to put a drop on a word, coarse enough to ignore a kick's decay. */
export const WINDOW = 0.25
const FADE = 1.5

export interface Drop {
  /** Seconds into the bed where the low end returns. */
  at: number
  /** dB the low end rises by across it: how hard it hits. */
  lift: number
  /** How long the bass was out before it. */
  after: number
}

/**
 * Where the bass drops out and slams back, from the low-band RMS level (dB)
 * of consecutive WINDOW-second slices. A gap is a run sitting 9dB+ under the
 * bed's typical full level; the drop is the first slice back above the line.
 * Two kinds count:
 * - a breakdown: a gap of 2s or more (Lyria's, 4–6s before its drops);
 * - a shorter gap (0.75s+) that opens a SUSTAINED section: the next 4s
 *   average 10dB+ over the 2s before. ElevenLabs writes a half-time 808 groove
 *   with 1–1.5s holes and then a ~1s breakdown into the steady big drop.
 * Other short gaps are the groove itself, not an arrangement change.
 */
export function findDrops(lowDb: number[]): Drop[] {
  const levels = lowDb.map(v => (Number.isFinite(v) ? v : -120))
  const audible = levels.filter(v => v > -90).sort((a, b) => a - b)
  if (audible.length < 8) return []
  const full = audible[Math.floor(audible.length * 0.75)]
  const line = full - 9
  const minRun = Math.ceil(2 / WINDOW)
  const minHole = Math.ceil(0.75 / WINDOW)
  const mean = (from: number, to: number) => {
    const part = levels.slice(Math.max(0, from), Math.max(0, to))
    return part.length ? part.reduce((a, b) => a + b, 0) / part.length : -120
  }
  const opensSection = (i: number) =>
    i + Math.ceil(4 / WINDOW) <= levels.length &&
    mean(i, i + Math.ceil(4 / WINDOW)) - mean(i - Math.ceil(2 / WINDOW), i) >= 10
  const drops: Drop[] = []
  let start = -1
  for (let i = 0; i < levels.length; i++) {
    const quiet = levels[i] < line
    if (quiet && start < 0) start = i
    if (!quiet && start >= 0) {
      // Silence at the very end is the tail, not a breakdown; a drop needs music after it.
      const run = i - start
      if (levels[i] > -90 && (run >= minRun || (run >= minHole && opensSection(i)))) {
        const before = levels.slice(start, i)
        const floor = before.reduce((a, b) => a + b, 0) / before.length
        const hit = Math.max(...levels.slice(i, i + Math.ceil(1 / WINDOW)))
        drops.push({ at: i * WINDOW, lift: hit - floor, after: (i - start) * WINDOW })
      }
      start = -1
    }
  }
  return drops
}

/**
 * Seconds to trim from the head so a drop lands at `dropAt`: the earliest one
 * at or after it (only those can be moved earlier onto it). Not the longest
 * breakdown — Lyria's longest is a near-silent 16s bridge 60s in, which opens
 * the film in dead air and throws away the take's arrangement; the earliest
 * keeps the most of it and every drop found is a real 2s+ breakdown.
 */
export function fitOffset(
  drops: Drop[],
  dropAt: number | undefined,
): { offset: number; drop?: Drop } {
  if (dropAt === undefined) return { offset: 0 }
  const usable = drops.filter(d => d.at >= dropAt)
  if (!usable.length) return { offset: 0 }
  const drop = usable[0]
  return { offset: drop.at - dropAt, drop }
}

/** `dropAt` from a host action's params, checked against the film. */
export function dropAtParam(value: unknown, duration: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const dropAt = Number(value)
  if (!(dropAt >= 0 && dropAt < duration))
    throw new Error('drop_at must be a film second inside the duration')
  return dropAt
}

async function lowBandLevels(file: string): Promise<number[]> {
  const rate = 8000
  const { stdout } = await execFileAsync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-af',
    `lowpass=f=120,aresample=${rate},asetnsamples=n=${rate * WINDOW}:p=0,` +
      'astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f',
    'null',
    '-',
  ])
  return stdout
    .split('\n')
    .filter(line => line.includes('RMS_level='))
    .map(line => Number.parseFloat(line.split('=')[1]))
}

/** Seconds of nothing before the take starts: an ElevenLabs bed has opened with ~4s of it. */
async function leadingSilence(file: string): Promise<number> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-t',
    '15',
    '-i',
    file,
    '-af',
    'silencedetect=noise=-50dB:d=0.25',
    '-f',
    'null',
    '-',
  ])
  const start = /silence_start: (-?[\d.]+)/.exec(stderr)
  const end = /silence_end: ([\d.]+)/.exec(stderr)
  return start && Number(start[1]) <= 0.05 && end ? Number(end[1]) : 0
}

export interface Fit {
  rawDuration: number
  drops: Drop[]
  offset: number
  drop?: Drop
  length: number
}

/** Measure the raw take at `raw`, write the fitted bed to `out`. */
export async function fitBed(
  raw: string,
  out: string,
  duration: number,
  dropAt: number | undefined,
): Promise<Fit> {
  const rawDuration = await getMediaDurationSec(raw)
  const drops = findDrops(await lowBandLevels(raw))
  // With no drop to land, the bed starts where the take's sound does.
  const { offset, drop } =
    dropAt === undefined
      ? { offset: Math.max(0, (await leadingSilence(raw)) - 0.05), drop: undefined }
      : fitOffset(drops, dropAt)
  const length = Math.min(duration, rawDuration - offset)
  await execFileAsync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-ss',
    offset.toFixed(3),
    '-i',
    raw,
    '-t',
    length.toFixed(3),
    '-af',
    `afade=t=out:st=${Math.max(0, length - FADE).toFixed(3)}:d=${FADE}`,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    out,
  ])
  return { rawDuration, drops, offset, drop, length }
}

const list = (drops: Drop[], shift = 0) =>
  drops.length
    ? drops
        .map(
          d =>
            `${(d.at - shift).toFixed(2)}s (+${d.lift.toFixed(0)}dB after ${d.after.toFixed(2)}s without bass)`,
        )
        .join(', ')
    : 'none measured'

/** What the agent needs to know about the fit, in film time. */
export function describeFit(fit: Fit, rel: string, duration: number, dropAt?: number): string[] {
  const inFilm = fit.drops.filter(d => d.at >= fit.offset && d.at - fit.offset < fit.length)
  const lines = [`Measured drops in the raw take: ${list(fit.drops)}.`]
  if (dropAt === undefined)
    lines.push(
      fit.offset > 0
        ? `No drop_at given: the bed starts where the take's sound does (${fit.offset.toFixed(2)}s of silence trimmed).`
        : 'No drop_at given: the bed starts at the top of the take.',
    )
  else if (fit.drop)
    lines.push(
      `Trimmed ${fit.offset.toFixed(2)}s from the head so the ${fit.drop.at.toFixed(2)}s drop lands on ${dropAt.toFixed(2)}s.`,
    )
  else
    lines.push(
      `⚠ No measured drop at or after ${dropAt.toFixed(2)}s to move onto it; the bed starts at the top. Shape the turn with a thin window ending on the word, or regenerate.`,
    )
  lines.push(
    `Fitted bed: ${rel} (${fit.length.toFixed(2)}s, ${FADE}s fade out). Drops in film time: ${list(inFilm, fit.offset)}.`,
  )
  if (fit.length < duration - 0.05)
    lines.push(
      `⚠ The take ran out ${(duration - fit.length).toFixed(2)}s before the film ends; regenerate with a longer piece, or use an earlier drop.`,
    )
  lines.push(
    'Make the other sections with thin windows ending on their words (the bass slams back when each ends), then pitch motion mix.',
  )
  return lines
}
