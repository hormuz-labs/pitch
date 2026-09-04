/**
 * Transcription service — local Whisper via transformers.js, served over HTTP.
 *
 * Endpoints:
 *   GET  /health      → { status, model, ready }
 *   POST /transcribe  → multipart form, field `file` = WAV audio
 *                     ← { text, segments: [{ start, end, text, words: [...] }] }
 *
 * This is what the recording-editor agent tools (TRANSCRIPTION_SERVICE_URL)
 * and the worker's edit-recording flow call. Runs fully local — no external
 * API calls at request time.
 */
import { env, pipeline } from '@huggingface/transformers'
import { decodeWav, resampleTo16k } from './wav'

if (process.env.HF_CACHE_DIR) env.cacheDir = process.env.HF_CACHE_DIR

const PORT = Number(process.env.PORT || 4000)
const MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-small'
const DTYPE = process.env.WHISPER_DTYPE || 'q8'
/** Split a transcript into a new segment when consecutive words gap past this. */
const SEGMENT_GAP_SEC = 0.6

interface Word {
  word: string
  start: number
  end: number
}

interface Segment {
  start: number
  end: number
  text: string
  words: Word[]
}

interface RawChunk {
  text: string
  timestamp: [number | null, number | null]
}

// The ASR pipeline is a heavyweight singleton; its precise generic type adds
// noise without value here, so we hold it behind a small typed wrapper.
type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{
  text: string
  chunks?: RawChunk[]
}>

let transcriber: Transcriber | null = null
let modelError: string | null = null

async function getTranscriber(): Promise<Transcriber> {
  if (transcriber) return transcriber
  if (modelError) throw new Error(modelError)
  try {
    console.log(`[model] loading ${MODEL} (dtype=${DTYPE}) from cache: ${env.cacheDir}`)
    const t0 = Date.now()
    const pipe = await pipeline('automatic-speech-recognition', MODEL, { dtype: DTYPE as never })
    transcriber = pipe as unknown as Transcriber
    console.log(`[model] ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return transcriber
  } catch (e) {
    modelError = e instanceof Error ? e.message : String(e)
    console.error(`[model] failed to load: ${modelError}`)
    throw new Error(modelError)
  }
}

/** Serialize inference — ONNX runtime is single-session here. */
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Group word-level chunks into sentence-ish segments on silence gaps. */
function wordsToSegments(words: Word[]): Segment[] {
  const segments: Segment[] = []
  let current: Segment | null = null
  for (const w of words) {
    if (!current || w.start - current.end > SEGMENT_GAP_SEC) {
      current = { start: w.start, end: w.end, text: '', words: [] }
      segments.push(current)
    }
    current.end = w.end
    current.words.push(w)
    current.text = `${current.text} ${w.word}`.trim()
  }
  return segments
}

function chunksToSegments(chunks: RawChunk[]): Segment[] {
  const segments: Segment[] = []
  for (const c of chunks) {
    const [start, end] = c.timestamp
    if (start == null || end == null) continue
    const text = c.text.trim()
    if (!text) continue
    segments.push({ start, end, text, words: [] })
  }
  return segments
}

async function transcribe(samples: Float32Array): Promise<{ text: string; segments: Segment[] }> {
  const asr = await getTranscriber()

  // Word-level timestamps give the agent precise click/fill anchors. If the
  // model export can't do word mode, fall back to chunk-level timestamps.
  try {
    const out = await asr(samples, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    const words: Word[] = []
    for (const c of out.chunks || []) {
      const [start, end] = c.timestamp
      if (start == null || end == null) continue
      const word = c.text.trim()
      if (!word) continue
      words.push({ word, start, end })
    }
    const segments = wordsToSegments(words)
    return { text: segments.map(s => s.text).join(' '), segments }
  } catch (e) {
    console.warn(
      `[transcribe] word-level timestamps unavailable, falling back to chunks: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
    const out = await asr(samples, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    return { text: out.text.trim(), segments: chunksToSegments(out.chunks || []) }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Warm the model at boot so /health reflects readiness and the first real
// request isn't stuck on a multi-minute load.
getTranscriber().catch(() => {})

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ status: 'ok', model: MODEL, ready: transcriber !== null, modelError })
    }

    if (req.method === 'POST' && url.pathname === '/transcribe') {
      let form: FormData
      try {
        form = await req.formData()
      } catch {
        return json({ error: 'expected multipart/form-data with a `file` field' }, 400)
      }
      const file = form.get('file')
      if (!file || typeof file === 'string') {
        return json({ error: 'missing `file` field in form data' }, 400)
      }
      try {
        const decoded = decodeWav(await file.arrayBuffer())
        const samples = resampleTo16k(decoded.samples, decoded.sampleRate)
        if (samples.length < 1600) return json({ error: 'audio too short (< 0.1s)' }, 400)
        const t0 = Date.now()
        const result = await enqueue(() => transcribe(samples))
        console.log(
          `[transcribe] ${(samples.length / 16000).toFixed(1)}s audio → ${result.segments.length} ` +
            `segments in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        )
        return json(result)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(`[transcribe] failed: ${message}`)
        return json({ error: message }, 500)
      }
    }

    return json({ error: 'not found' }, 404)
  },
})

console.log(`[server] transcription service listening on :${server.port} (model=${MODEL})`)
