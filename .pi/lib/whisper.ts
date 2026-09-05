/**
 * Local speech-to-text: whisper.cpp, the one transcriber the studio has.
 *
 * `whisper-cli` is built into the api image (Dockerfile.base) and the model
 * lives in the whisper cache volume (`make whisper-model`). Launch-film
 * narration alignment and recording-edit transcription both run it; there
 * used to be a second transcriber, a transformers.js container that the
 * recording tools posted audio to, doing the same job with a different model.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { availableParallelism, cpus, homedir, tmpdir } from 'node:os'
import path from 'node:path'

export interface Word {
  word: string
  start: number
  end: number
}

export interface Segment {
  start: number
  end: number
  text: string
  words: Word[]
}

const CACHE_DIRS = [
  path.join(homedir(), '.cache', 'whisper-cpp'),
  '/usr/local/share/whisper.cpp/models',
  path.resolve('docker-data/whisper'),
]
const MODELS = [
  'ggml-large-v3-turbo.bin',
  'ggml-large-v3.bin',
  'ggml-medium.en.bin',
  'ggml-small.en.bin',
  'ggml-base.en.bin',
]

/** The best model installed, or null. WHISPER_MODEL names one explicitly. */
export function findWhisperModel(): string | null {
  const explicit = process.env.WHISPER_MODEL
  if (explicit && existsSync(explicit.replace(/^~/, homedir()))) {
    return explicit.replace(/^~/, homedir())
  }
  for (const dir of CACHE_DIRS) {
    for (const m of MODELS) {
      const p = path.join(dir, m)
      if (existsSync(p)) return p
    }
  }
  return null
}

/**
 * Detect optimal thread count for whisper computation.
 * whisper.cpp scales best with physical cores (typically total/2 on SMT/hyperthreaded CPUs)
 * capped around 12 to avoid cache thrashing. Can be overridden with WHISPER_THREADS.
 */
export function defaultWhisperThreads(): number {
  const env = process.env.WHISPER_THREADS
  if (env) {
    const parsed = parseInt(env, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  const total = typeof availableParallelism === 'function' ? availableParallelism() : cpus().length
  if (total <= 4) return total
  if (total <= 8) return Math.min(total, 6)
  return Math.min(Math.floor(total / 2), 12)
}

/** A new segment starts after a silence this long, or at a sentence end. */
const GAP_SEC = 0.7
const MAX_WORDS = 28

/**
 * Word timestamps into sentence-ish segments: the shape the recording tools
 * saved when the transcriber was a service, kept so `recording/transcript.json`
 * and everything that reads it are unchanged.
 */
export function wordsToSegments(words: Word[]): Segment[] {
  const out: Segment[] = []
  let cur: Segment | null = null
  for (const w of words) {
    const prev = cur?.words[cur.words.length - 1]
    const breakHere =
      !cur ||
      (prev && w.start - prev.end > GAP_SEC) ||
      (prev && /[.?!]$/.test(prev.word)) ||
      (cur && cur.words.length >= MAX_WORDS)
    if (breakHere || !cur) {
      cur = { start: w.start, end: w.end, text: '', words: [] }
      out.push(cur)
    }
    cur.words.push(w)
    cur.end = w.end
    cur.text = `${cur.text} ${w.word}`.trim()
  }
  return out
}

/** whisper.cpp's -oj output: one token per entry when run with -ml 1. */
interface RawJson {
  transcription?: Array<{ text: string; offsets: { from: number; to: number } }>
}

export function parseWhisperJson(raw: RawJson): Word[] {
  const words: Word[] = []
  for (const t of raw.transcription ?? []) {
    const word = t.text.trim()
    if (!word) continue
    const end = +(t.offsets.to / 1000).toFixed(3)
    // A token that does not start with a space is a piece of the previous
    // word (sub-word units, trailing punctuation): glue it on.
    const last = words[words.length - 1]
    if (last && !/^\s/.test(t.text)) {
      last.word += word
      last.end = end
      continue
    }
    words.push({ word, start: +(t.offsets.from / 1000).toFixed(3), end })
  }
  return words
}

/**
 * Transcribe a 16kHz mono WAV with word timestamps. Throws with a one-line
 * reason when the binary or the model is missing — a host problem the agent
 * can only report.
 */
export function transcribeWav(
  wav: string,
  opts: { lang?: string; bin?: string; threads?: number } = {},
): { model: string; words: Word[]; segments: Segment[] } {
  const bin = opts.bin ?? process.env.WHISPER_CLI ?? 'whisper-cli'
  const threads = opts.threads ?? defaultWhisperThreads()
  const model = findWhisperModel()
  if (!model) {
    throw new Error(
      'no whisper.cpp model on the host (expected a ggml model in the whisper cache volume, ' +
        'docker-data/whisper — `make whisper-model`).',
    )
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'whisper-'))
  const base = path.join(tmp, 'words')
  try {
    execFileSync(
      bin,
      [
        '-m',
        model,
        '-f',
        wav,
        '-t',
        String(threads),
        '-l',
        opts.lang ?? 'en',
        '-ml',
        '1',
        '-sow',
        '-oj',
        '-of',
        base,
        '-np',
      ],
      { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 },
    )
    const words = parseWhisperJson(JSON.parse(readFileSync(`${base}.json`, 'utf8')))
    return { model: path.basename(model), words, segments: wordsToSegments(words) }
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string; code?: string }
    const detail =
      e.code === 'ENOENT'
        ? `${bin} is not installed (it is built in Dockerfile.base)`
        : String(e.stderr || e.message || err)
            .trim()
            .split('\n')
            .filter(Boolean)
            .slice(-2)
            .join(' | ')
    throw new Error(`whisper-cli failed on the host: ${detail}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
