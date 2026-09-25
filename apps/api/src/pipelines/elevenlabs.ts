/**
 * ElevenLabs — narration, a music bed and single sounds, generated.
 *
 * The agent's shell has no network, so these are host actions behind the
 * `pitch motion voices|tts|music|sound` commands (.pi/cli/motion.ts). Each
 * writes its file into the calling workspace with a small provenance sidecar
 * beside it; the API key never crosses into the workspace.
 *
 * Narration here is the alternative to Gemini TTS: .pi/audio.json says which
 * of the two `pitch motion tts` records with. Music is `pitch motion music
 * --provider elevenlabs`: a music_v2 composition plan built from the film's
 * sections, fitted onto the turn word by music-fit.ts (Lyria, pipelines/
 * lyria.ts, is the default: its vocal-free takes follow an arrangement better). Sound effects have no other generator — the curated
 * library under assets/ is the alternative.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { elevenLabsKey } from '../lib/elevenlabs.js'
import { getMediaDurationSec } from '../render/media.js'
import { registerHostAction } from '../studio/host-actions.js'
import type { Workspace } from '../studio/paths.js'
import { insideWorkspace } from './media.js'
import { describeFit, dropAtParam, fitBed } from './music-fit.js'

const logger = createLogger('studio:elevenlabs')
const BASE_URL = 'https://api.elevenlabs.io'
const MUSIC_MODEL = 'music_v2'
const SFX_MODEL = 'eleven_text_to_sound_v2'
const DEFAULT_TTS_MODEL = 'eleven_v3'
const TTS_MODELS = new Set(['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5'])
const MUSIC_TIMEOUT_MS = Number(process.env.ELEVENLABS_MUSIC_TIMEOUT_MS ?? 10 * 60_000)
const SFX_TIMEOUT_MS = Number(process.env.ELEVENLABS_SFX_TIMEOUT_MS ?? 2 * 60_000)
const TTS_TIMEOUT_MS = Number(process.env.ELEVENLABS_TTS_TIMEOUT_MS ?? 3 * 60_000)

export interface MusicRequest {
  prompt: string
  duration: number
}

/** One section of the film's music plan, ending at a film second. */
export interface MusicSection {
  /** Section label: Intro, Drop, Breakdown, Big Drop, Outro… */
  label: string
  /** Film second the section ends on (the last one ends the film). */
  until: number
  /** What happens in it: what enters, leaves, builds. Sent as a style, never as text. */
  text?: string
  styles?: string[]
  avoid?: string[]
}

export interface PlanRequest {
  /** The bed's identity, 6–7 styles: genre and era, BPM, instruments, mood. */
  styles: string[]
  avoid?: string[]
  sections: MusicSection[]
  duration: number
  /** Seconds added to the last section so trimming the head onto the turn never leaves the film short. */
  slack?: number
}

const NO_VOICE = ['vocals', 'singing', 'spoken word', 'lyrics']
const MIN_CHUNK_MS = 3000
const MAX_CHUNK_MS = 120_000
/** music_v2 lands the drops up to ~3s late; this much spare tail survives the trim. */
export const MUSIC_SLACK = 5

const styleList = (...lists: (string[] | undefined)[]) =>
  [
    ...new Set(
      lists
        .flat()
        .map(s => String(s ?? '').trim())
        .filter(Boolean),
    ),
  ].slice(0, 50)

/**
 * A music_v2 composition plan from the film's sections: one chunk per section
 * with its exact duration, the identity styles on the first chunk (it sets the
 * tone), the genre anchors on every chunk so a later one cannot drift, no
 * voice anywhere, high context adherence so the sections read as one piece.
 *
 * A chunk's `text` is LYRICS to the model: sections described there as plain
 * words ("filtered drums, tension building") came back sung, word for word.
 * So the description goes in as an inline cue in braces, which the model
 * reads as direction: `[Intro]\n{filtered drums, no bass}` — measured vocal-free.
 */
export function compositionPlanBody(input: PlanRequest): Record<string, unknown> {
  const styles = styleList(input.styles)
  if (!styles.length)
    throw new Error('music styles are required: genre and era, BPM, instruments, mood')
  if (!Number.isFinite(input.duration) || input.duration < 3 || input.duration > 600)
    throw new Error('music duration must be between 3 and 600 seconds')
  const sections = input.sections ?? []
  if (!sections.length) throw new Error('music sections are required')
  if (sections.length > 30) throw new Error('at most 30 music sections')
  const slack = input.slack ?? MUSIC_SLACK
  let start = 0
  const chunks = sections.map((section, i) => {
    const last = i === sections.length - 1
    const end = last ? input.duration : Number(section.until)
    if (!(end > start)) throw new Error(`music section "${section.label}" must end after ${start}s`)
    const ms = Math.round((end - start + (last ? slack : 0)) * 1000)
    if (ms < MIN_CHUNK_MS)
      throw new Error(
        `music section "${section.label}" is ${(end - start).toFixed(2)}s; each must be at least 3s — merge it into a neighbour and make the change with a thin window`,
      )
    if (ms > MAX_CHUNK_MS)
      throw new Error(`music section "${section.label}" is over 120s; split it`)
    start = end
    const label = String(section.label ?? '').trim() || `Section ${i + 1}`
    return {
      text: section.text?.trim()
        ? `[${label}]\n{${section.text.trim().replace(/[{}]/g, '')}}`
        : `[${label}]`,
      duration_ms: ms,
      positive_styles: styleList(
        ['instrumental'],
        i === 0 ? styles : styles.slice(0, 2),
        section.styles,
      ),
      negative_styles: styleList(NO_VOICE, input.avoid, section.avoid),
      context_adherence: 'high',
    }
  })
  return { model_id: MUSIC_MODEL, composition_plan: { chunks } }
}

export interface SoundRequest {
  prompt: string
  duration?: number
  influence?: number
  loop?: boolean
}

export interface VoiceoverRequest {
  text: string
  voiceId: string
  model?: string
  stability?: number
  similarity?: number
  style?: number
  speed?: number
}

// ── Request bodies: pure, so the limits are testable without a key ──────────

export function voiceoverRequestBody(input: VoiceoverRequest): Record<string, unknown> {
  const text = input.text.trim()
  const voiceId = input.voiceId.trim()
  const model = input.model || DEFAULT_TTS_MODEL
  if (!text) throw new Error('voiceover text is required')
  if (!voiceId)
    throw new Error(
      'an ElevenLabs voice id is required — pick one with `pitch motion voices`, or set tts.elevenlabs.voice in .pi/audio.json',
    )
  if (!TTS_MODELS.has(model))
    throw new Error(`voiceover model must be one of ${[...TTS_MODELS].join(', ')}`)
  const max = model === 'eleven_v3' ? 5000 : model === 'eleven_multilingual_v2' ? 10000 : 40000
  if (text.length > max)
    throw new Error(`${model} voiceover text must be at most ${max} characters`)

  const settings: Record<string, number> = {}
  for (const [name, value] of [
    ['stability', input.stability],
    ['similarity_boost', input.similarity],
    ['style', input.style],
  ] as const) {
    if (value === undefined) continue
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new Error(`${name} must be between 0 and 1`)
    settings[name] = value
  }
  if (input.speed !== undefined) {
    if (!Number.isFinite(input.speed) || input.speed < 0.7 || input.speed > 1.2)
      throw new Error('voiceover speed must be between 0.7 and 1.2')
    settings.speed = input.speed
  }
  return {
    text,
    model_id: model,
    ...(Object.keys(settings).length ? { voice_settings: settings } : {}),
  }
}

export function musicRequestBody(input: MusicRequest): Record<string, unknown> {
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('music prompt is required')
  if (prompt.length > 4100) throw new Error('music prompt must be at most 4100 characters')
  if (!Number.isFinite(input.duration) || input.duration < 3 || input.duration > 600)
    throw new Error('music duration must be between 3 and 600 seconds')
  return {
    prompt,
    music_length_ms: Math.round(input.duration * 1000),
    model_id: MUSIC_MODEL,
    force_instrumental: true,
  }
}

export function soundRequestBody(input: SoundRequest): Record<string, unknown> {
  const text = input.prompt.trim()
  if (!text) throw new Error('sound prompt is required')
  if (text.length > 450) throw new Error('sound prompt must be at most 450 characters')
  if (
    input.duration !== undefined &&
    (!Number.isFinite(input.duration) || input.duration < 0.5 || input.duration > 30)
  )
    throw new Error('sound duration must be between 0.5 and 30 seconds')
  if (
    input.influence !== undefined &&
    (!Number.isFinite(input.influence) || input.influence < 0 || input.influence > 1)
  )
    throw new Error('prompt influence must be between 0 and 1')
  return {
    text,
    model_id: SFX_MODEL,
    loop: input.loop ?? false,
    ...(input.duration === undefined ? {} : { duration_seconds: input.duration }),
    ...(input.influence === undefined ? {} : { prompt_influence: input.influence }),
  }
}

// ── The API ─────────────────────────────────────────────────────────────────

function outputPath(ws: Workspace, asked: unknown, fallback: string): { rel: string; abs: string } {
  const rel = String(asked || fallback)
  if (!/\.mp3$/i.test(rel)) throw new Error('ElevenLabs writes .mp3 — name the output that way')
  return { rel, abs: insideWorkspace(ws, rel) }
}

function detail(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return parsed?.detail?.message ?? parsed?.detail ?? parsed?.message ?? raw
  } catch {
    return raw
  }
}

async function generate(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  outputFormat?: string,
  signal?: AbortSignal,
): Promise<{ audio: Buffer; contentType: string; songId?: string }> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const query = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : ''
    const res = await fetch(`${BASE_URL}${endpoint}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': elevenLabsKey() },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok || /json/i.test(contentType)) {
      const text = (await res.text()).slice(0, 1200)
      throw new Error(`ElevenLabs refused (HTTP ${res.status}): ${detail(text)}`)
    }
    return {
      audio: Buffer.from(await res.arrayBuffer()),
      contentType,
      songId: res.headers.get('song-id') ?? undefined,
    }
  } catch (error: any) {
    if (error?.name === 'AbortError')
      throw new Error(`ElevenLabs timed out after ${timeoutMs / 1000}s`)
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

async function getJson(endpoint: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'xi-api-key': elevenLabsKey() },
      signal: controller.signal,
    })
    const text = await res.text()
    let body: any
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`ElevenLabs returned HTTP ${res.status} and no JSON: ${text.slice(0, 600)}`)
    }
    if (!res.ok) throw new Error(`ElevenLabs refused (HTTP ${res.status}): ${detail(text)}`)
    return body
  } catch (error: any) {
    if (error?.name === 'AbortError')
      throw new Error(`ElevenLabs timed out after ${timeoutMs / 1000}s`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function save(
  abs: string,
  result: { audio: Buffer; contentType: string; songId?: string },
  metadata: Record<string, unknown>,
): Promise<void> {
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, result.audio)
  await writeFile(
    `${abs}.elevenlabs.json`,
    `${JSON.stringify(
      {
        provider: 'ElevenLabs',
        contentType: result.contentType,
        songId: result.songId,
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

const mb = (buf: Buffer) => `${(buf.length / 1e6).toFixed(1)} MB`

// ── Host actions ────────────────────────────────────────────────────────────

registerHostAction('elevenlabs_voices', async (_ws, params) => {
  const search = String(params.search ?? '').trim()
  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 30)))
  const query = new URLSearchParams({
    page_size: String(limit),
    sort: 'name',
    sort_direction: 'asc',
  })
  if (search) query.set('search', search)
  const body = await getJson(`/v2/voices?${query}`, TTS_TIMEOUT_MS)
  const voices: any[] = Array.isArray(body?.voices) ? body.voices : []
  if (!voices.length) return search ? `No ElevenLabs voices match "${search}".` : 'No voices found.'
  return voices
    .map(voice => {
      const labels =
        voice?.labels && typeof voice.labels === 'object'
          ? Object.values(voice.labels).filter(Boolean).join(', ')
          : ''
      return `${voice.name} — ${voice.voice_id}${labels ? ` — ${labels}` : ''}`
    })
    .join('\n')
})

registerHostAction('elevenlabs_voiceover', async (ws, params, ctx) => {
  const script = params.script ? String(params.script) : ''
  const text = script
    ? await readFile(insideWorkspace(ws, script), 'utf8')
    : String(params.text ?? '')
  const request: VoiceoverRequest = {
    text: text.replace(/\s+/g, ' ').trim(),
    voiceId: String(params.voiceId ?? ''),
    model: params.model ? String(params.model) : undefined,
    stability: params.stability === undefined ? undefined : Number(params.stability),
    similarity: params.similarity === undefined ? undefined : Number(params.similarity),
    style: params.style === undefined ? undefined : Number(params.style),
    speed: params.speed === undefined ? undefined : Number(params.speed),
  }
  const body = voiceoverRequestBody(request)
  const out = outputPath(ws, params.out, 'audio/vo.mp3')
  const voiceId = request.voiceId.trim()
  logger.info({ workspace: ws.internal, out: out.rel, voiceId, model: body.model_id }, 'voiceover')
  const result = await generate(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    body,
    TTS_TIMEOUT_MS,
    'mp3_44100_128',
    ctx.signal,
  )
  await save(out.abs, result, { kind: 'voiceover', voiceId, script: script || undefined, ...body })
  // The exact text spoken, beside the file, so `pitch motion align` can time every word.
  const txt = out.abs.replace(/\.\w+$/, '.txt')
  await writeFile(txt, `${request.text}\n`, 'utf8')
  if (params.resultFormat === 'json') {
    return JSON.stringify({ file: out.rel, durationSeconds: await getMediaDurationSec(out.abs) })
  }
  const words = request.text.split(/\s+/).filter(Boolean).length
  return (
    `Recorded one continuous ElevenLabs read: ${out.rel} (${mb(result.audio)}, ${words} words, ${String(body.model_id)}, voice ${voiceId}). ` +
    `Script saved beside it as ${path.basename(txt)}.\n` +
    `Next: audio: { vo: "${out.rel}" } in shots.js, pitch motion align --vo ${out.rel}, cue every shot, pitch motion sync --write.`
  )
})

registerHostAction('elevenlabs_music', async (ws, params, ctx) => {
  const duration = Number(params.duration)
  const dropAt = dropAtParam(params.dropAt, duration)
  // A plan when the film's sections are given — each section its exact length;
  // otherwise a prompt, with spare length only when a drop has to be fitted.
  const body = Array.isArray(params.sections)
    ? compositionPlanBody({
        styles: Array.isArray(params.styles) ? params.styles : [],
        avoid: Array.isArray(params.avoid) ? params.avoid : undefined,
        sections: params.sections,
        duration,
      })
    : musicRequestBody({
        prompt: String(params.prompt ?? ''),
        duration: Math.min(600, duration + (dropAt === undefined ? 0 : MUSIC_SLACK)),
      })
  const out = outputPath(ws, params.out, 'audio/music.mp3')
  const rawRel = out.rel.replace(/\.mp3$/i, '.elevenlabs.mp3')
  const raw = insideWorkspace(ws, rawRel)
  logger.info({ workspace: ws.internal, out: out.rel, duration, dropAt }, 'music')
  const result = await generate('/v1/music', body, MUSIC_TIMEOUT_MS, 'mp3_48000_192', ctx.signal)
  await save(raw, result, { kind: 'music', ...body })
  const fit = await fitBed(raw, out.abs, duration, dropAt)
  return [
    `Generated with ElevenLabs ${MUSIC_MODEL}: ${rawRel} (${fit.rawDuration.toFixed(1)}s raw, ${mb(result.audio)}).`,
    ...describeFit(fit, out.rel, duration, dropAt),
  ].join('\n')
})

registerHostAction('elevenlabs_sound', async (ws, params, ctx) => {
  const request: SoundRequest = {
    prompt: String(params.prompt ?? ''),
    duration: params.duration === undefined ? undefined : Number(params.duration),
    influence: params.influence === undefined ? undefined : Number(params.influence),
    loop: params.loop === undefined ? undefined : Boolean(params.loop),
  }
  const body = soundRequestBody(request)
  const out = outputPath(ws, params.out, 'audio/generated-sfx/sound.mp3')
  logger.info({ workspace: ws.internal, out: out.rel, duration: request.duration }, 'sound')
  const result = await generate('/v1/sound-generation', body, SFX_TIMEOUT_MS, undefined, ctx.signal)
  await save(out.abs, result, { kind: 'sound', model: SFX_MODEL, ...body })
  return `Generated ${out.rel} (${mb(result.audio)}). In audio/sfx-cues.json: { "t": <when>, "event": "<class>", "file": "${out.rel}" } — then pitch motion sfx --mode build measures its onset and places it.`
})
