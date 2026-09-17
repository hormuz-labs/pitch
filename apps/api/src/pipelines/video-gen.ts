/**
 * Generated video — Gemini Omni.
 *
 * Everything else the studio makes is RENDERED: a GSAP composition captured
 * frame by frame, a real browser recorded, slides printed. That covers the
 * product itself, because a launch film has to show the actual product. It
 * does not cover the shots around it — an establishing image, a texture, a
 * metaphor, B-roll nobody has footage of — and those used to be answered with
 * "we can't".
 *
 * The Omni endpoint is synchronous: one POST returns the finished video, with
 * audio, in roughly half a minute for 360p and longer as the resolution
 * climbs. There is no operation to poll. The result comes back as a Files API
 * URI which needs the same key appended to download.
 *
 * The whole call happens here because the agent's VM has no network: it asks
 * for a shot by workspace path, and a file appears in the workspace.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { execAsync } from '../render/media.js'
import { registerHostAction } from '../studio/host-actions.js'
import type { Workspace } from '../studio/paths.js'
import { insideWorkspace } from './media.js'

const logger = createLogger('studio:video-gen')

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const MODEL = process.env.OMNI_MODEL || 'gemini-omni-1.1-flash'

/** 4K takes minutes; nothing should take more than this. */
const TIMEOUT_MS = Number(process.env.OMNI_TIMEOUT_MS ?? 15 * 60_000)

const ASPECTS = new Set(['16:9', '9:16'])
const RESOLUTIONS = new Set(['360p', '720p', '1080p', '4k'])
const TASKS = new Set(['text_to_video', 'image_to_video', 'reference_to_video', 'edit', 'extend'])

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('video generation needs GEMINI_API_KEY in the studio environment')
  return key
}

type Content = { type: string; text?: string; data?: string; mime_type?: string; uri?: string }

/** The video the model returned, if it returned one. */
export function videoFromInteraction(body: any): { uri?: string; data?: string } | null {
  const steps: any[] = Array.isArray(body?.steps) ? body.steps : []
  for (const step of steps.slice().reverse()) {
    if (step?.type !== 'model_output') continue
    const parts: Content[] = Array.isArray(step.content) ? step.content : []
    const video = parts.find(p => p?.type === 'video' || p?.mime_type?.startsWith('video/'))
    if (video) return { uri: video.uri, data: video.data }
  }
  return null
}

/** What the generation cost, in the model's own units, for the turn summary. */
export function describeUsage(usage: any): string {
  if (!usage) return ''
  const byModality: Array<{ modality?: string; tokens?: number }> = Array.isArray(
    usage.output_tokens_by_modality,
  )
    ? usage.output_tokens_by_modality
    : []
  const video = byModality.find(m => m.modality === 'video')?.tokens
  const total = usage.total_tokens
  return [
    total ? `${total.toLocaleString()} tokens` : null,
    video ? `${video.toLocaleString()} of them video` : null,
  ]
    .filter(Boolean)
    .join(', ')
}

async function post(body: unknown, signal: AbortSignal): Promise<any> {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text()
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Gemini returned ${res.status} and no JSON: ${text.slice(0, 400)}`)
  }
  if (!res.ok || parsed?.error) {
    const message = parsed?.error?.message ?? `HTTP ${res.status}`
    throw new Error(`video generation refused: ${message}`)
  }
  return parsed
}

/** Download the Files API result. The URI already carries `?alt=media`. */
async function download(uri: string, dest: string, signal: AbortSignal): Promise<void> {
  const sep = uri.includes('?') ? '&' : '?'
  const res = await fetch(`${uri}${sep}key=${encodeURIComponent(apiKey())}`, { signal })
  if (!res.ok) throw new Error(`could not download the generated video: HTTP ${res.status}`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function describeFile(file: string, rel: string): Promise<string> {
  const { size } = await stat(file)
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries format=duration -show_entries stream=width,height -of json "${file}"`,
      { maxBuffer: 4 * 1024 * 1024 },
    )
    const probe = JSON.parse(stdout)
    const stream = probe.streams?.[0] ?? {}
    const seconds = Number(probe.format?.duration ?? 0)
    return `${rel} — ${stream.width}×${stream.height}, ${seconds.toFixed(1)}s, ${(size / 1e6).toFixed(1)} MB`
  } catch {
    return `${rel} — ${(size / 1e6).toFixed(1)} MB`
  }
}

/** Sidecar so a later turn can continue this shot after the chat is compacted. */
const sidecarFor = (file: string) => `${file}.omni.json`

async function previousIdFrom(ws: Workspace, ref: string): Promise<string> {
  // Accept either the id itself or the clip it belongs to, because the agent
  // has the filename in front of it and the id only in an older message.
  if (ref.startsWith('v1_')) return ref
  const sidecar = sidecarFor(insideWorkspace(ws, ref))
  if (!existsSync(sidecar))
    throw new Error(`no generation history for "${ref}" — pass the interaction id instead`)
  const saved = JSON.parse(await readFile(sidecar, 'utf8'))
  if (!saved?.interactionId) throw new Error(`no interaction id recorded for "${ref}"`)
  return String(saved.interactionId)
}

registerHostAction('video_generate', async (ws, params, ctx) => {
  const prompt = String(params.prompt ?? '').trim()
  if (!prompt) throw new Error('prompt is required')
  // A bare filename lands in renders/, which is where the asset shelf looks.
  // A clip written to the workspace root is one the user cannot point at.
  const asked = String(params.out ?? '')
  if (!/\.mp4$/i.test(asked)) throw new Error('out must be a workspace-relative .mp4 path')
  const outRel = asked.includes('/') ? asked : `renders/${asked}`
  const out = insideWorkspace(ws, outRel)

  const aspect = String(params.aspect ?? '16:9')
  if (!ASPECTS.has(aspect)) throw new Error(`aspect must be one of ${[...ASPECTS].join(', ')}`)
  const resolution = String(params.resolution ?? '720p')
  if (!RESOLUTIONS.has(resolution))
    throw new Error(`resolution must be one of ${[...RESOLUTIONS].join(', ')}`)
  const task = params.task ? String(params.task) : null
  if (task && !TASKS.has(task)) throw new Error(`task must be one of ${[...TASKS].join(', ')}`)

  // Text alone, or a workspace image to animate.
  const input: Content[] = [{ type: 'text', text: prompt }]
  if (params.image) {
    const rel = String(params.image)
    const image = insideWorkspace(ws, rel)
    if (!existsSync(image)) throw new Error(`no such image in the workspace: ${rel}`)
    const mime = MIME[path.extname(image).toLowerCase()]
    if (!mime) throw new Error(`unsupported image type for "${rel}" (use png, jpg or webp)`)
    input.push({ type: 'image', mime_type: mime, data: (await readFile(image)).toString('base64') })
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    input,
    response_format: { type: 'video', aspect_ratio: aspect, resolution, delivery: 'uri' },
  }
  if (params.continues)
    body.previous_interaction_id = await previousIdFrom(ws, String(params.continues))
  if (task) body.generation_config = { video_config: { task } }

  await mkdir(path.dirname(out), { recursive: true })
  logger.info({ workspace: ws.internal, out: outRel, resolution, aspect }, 'video_generate')

  const controller = new AbortController()
  const abort = () => controller.abort()
  ctx.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = Date.now()
  let result: any
  try {
    result = await post(body, controller.signal)
    const video = videoFromInteraction(result)
    if (!video?.uri && !video?.data)
      throw new Error(
        `the model returned no video (status: ${result?.status ?? 'unknown'}). ` +
          'Rephrase the shot — safety filters reject people, brands and likenesses.',
      )
    if (video.uri) await download(video.uri, out, controller.signal)
    else await writeFile(out, Buffer.from(String(video.data), 'base64'))
  } catch (err: any) {
    if (err?.name === 'AbortError')
      throw new Error(`video generation timed out after ${(TIMEOUT_MS / 1000).toFixed(0)}s`)
    throw err
  } finally {
    clearTimeout(timer)
    ctx.signal?.removeEventListener('abort', abort)
  }
  const seconds = (Date.now() - started) / 1000

  if (!existsSync(out)) throw new Error(`generation reported success but ${outRel} was not written`)
  const interactionId = String(result?.id ?? '')
  await writeFile(
    sidecarFor(out),
    `${JSON.stringify({ interactionId, prompt, model: MODEL, aspect, resolution, createdAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )

  const usage = describeUsage(result?.usage)
  return [
    `Generated ${await describeFile(out, outRel)} in ${seconds.toFixed(0)}s${usage ? ` (${usage})` : ''}.`,
    'It has its own audio track — mute or replace it if the film has a music bed.',
    `To refine this shot rather than start a new one, call video_generate again with continues: "${outRel}".`,
  ].join(' ')
})
