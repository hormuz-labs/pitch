/**
 * Lyria — a music bed generated from a timed arrangement, then fitted to it.
 *
 * The default behind `pitch motion music` (.pi/cli/motion.ts); ElevenLabs
 * music_v2 is the alternative (pipelines/elevenlabs.ts), exact in length but
 * loose with sections once it is kept from singing them. Lyria keeps the SHAPE of the arrangement but not its clock
 * or its length (68s and 103s for a 30s ask), so music-fit.ts measures the
 * take and trims it onto the turn word. The raw take is kept beside the bed.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { registerHostAction } from '../studio/host-actions.js'
import { insideWorkspace } from './media.js'
import { describeFit, dropAtParam, fitBed } from './music-fit.js'

const logger = createLogger('studio:lyria')
const MODEL = 'lyria-3.5'
const TIMEOUT_MS = Number(process.env.LYRIA_TIMEOUT_MS ?? 5 * 60_000)

/** The prompt as sent: the brief, instrumental, and the length the film needs. */
export function musicPrompt(prompt: string, duration: number): string {
  const brief = prompt.trim()
  if (!brief) throw new Error('music prompt is required')
  if (!Number.isFinite(duration) || duration < 3 || duration > 600)
    throw new Error('music duration must be between 3 and 600 seconds')
  const parts = [brief]
  if (!/instrumental/i.test(brief)) parts.push('Instrumental only, no vocals.')
  parts.push(`About ${Math.ceil(duration)} seconds long.`)
  return parts.join('\n')
}

async function generate(
  prompt: string,
  signal?: AbortSignal,
): Promise<{ audio: Buffer; mime: string; sections: string }> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set; music generation is unavailable')
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ model: MODEL, input: prompt, response_format: { type: 'audio' } }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!res.ok) throw new Error(`Lyria HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`)
  const json: any = await res.json()
  const content: any[] = (json?.steps ?? []).flatMap((s: any) => s?.content ?? [])
  const audio = content.find(c => c?.data && /^audio\//.test(c?.mime_type ?? ''))
  if (!audio) throw new Error(`Lyria returned no audio: ${JSON.stringify(json).slice(0, 400)}`)
  const sections = content
    .filter(c => typeof c?.text === 'string')
    .map(c =>
      c.text
        .replace(/\[\[|\]\]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .join(' ')
  return { audio: Buffer.from(audio.data, 'base64'), mime: audio.mime_type, sections }
}

registerHostAction('lyria_music', async (ws, params, ctx) => {
  const duration = Number(params.duration)
  const prompt = musicPrompt(String(params.prompt ?? ''), duration)
  const dropAt = dropAtParam(params.dropAt, duration)
  const rel = String(params.out || 'audio/music.mp3')
  if (!/\.mp3$/i.test(rel)) throw new Error('the bed is written as .mp3 — name the output that way')
  const out = insideWorkspace(ws, rel)
  const rawRel = rel.replace(/\.mp3$/i, '.lyria.mp3')
  const raw = insideWorkspace(ws, rawRel)

  logger.info({ workspace: ws.internal, out: rel, duration, dropAt }, 'music')
  const take = await generate(prompt, ctx.signal)
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(raw, take.audio)
  const fit = await fitBed(raw, out, duration, dropAt)
  await writeFile(
    `${out}.lyria.json`,
    `${JSON.stringify({ provider: 'Google Lyria', model: MODEL, prompt, raw: rawRel, sections: take.sections, ...fit, dropAt, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  return [
    `Generated with Lyria 3.5: ${rawRel} (${fit.rawDuration.toFixed(1)}s raw${take.sections ? `, sections ${take.sections}` : ''}).`,
    ...describeFit(fit, rel, duration, dropAt),
  ].join('\n')
})
