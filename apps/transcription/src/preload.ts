/**
 * Build-time helper: downloads the Whisper model into the transformers.js
 * cache so the Docker image ships with the weights baked in and cold starts
 * don't hit the network. Used by the Dockerfile (`RUN bun src/preload.ts`).
 */
import { env, pipeline } from '@huggingface/transformers'

if (process.env.HF_CACHE_DIR) env.cacheDir = process.env.HF_CACHE_DIR

const model = process.env.WHISPER_MODEL || 'Xenova/whisper-small'
const dtype = process.env.WHISPER_DTYPE || 'q8'

// Work around a Bun-on-Linux bug where concurrent `fetch` response bodies can
// be corrupted/truncated when transformers.js loads model files in parallel.
// Serialize all fetches during preload so each response is read fully before
// the next one starts. This only affects this build-time script.
let fetchQueue: Promise<unknown> = Promise.resolve()
const originalFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  // Chain each fetch behind the previous one's body consumption. The library
  // reads the body shortly after fetch resolves, so awaiting the returned
  // Response is enough to keep them from overlapping.
  const run = fetchQueue.then(() => originalFetch(input, init))
  fetchQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}) as typeof fetch

console.log(`[preload] downloading ${model} (dtype=${dtype}) → cache: ${env.cacheDir}`)
const t0 = Date.now()
// dtype accepts a fixed union in the typings; the env var is trusted config.
await pipeline('automatic-speech-recognition', model, { dtype: dtype as never })
console.log(`[preload] model cached in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
