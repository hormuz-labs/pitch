import path from 'node:path'
import { findStyle, styleNamedIn } from './styles.js'

const STUDIO_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:5'])

/** The skill pills on /new — a hint for the agent, matching `.pi/skills/*`. */
const STUDIO_SKILLS = new Set([
  'launch-video',
  'demo-video',
  'asset-demo',
  'slide-deck',
  'recording-edit',
  'generated-video',
  'docs-to-video',
])

/** Keep composer preferences predictable before they reach project.json and agent context. */
export function normalizeCreationOptions(value: unknown): Record<string, any> {
  const options =
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, any>) }
      : {}

  if ('aspectRatio' in options && !STUDIO_ASPECT_RATIOS.has(options.aspectRatio)) {
    delete options.aspectRatio
  }

  if ('skill' in options && !STUDIO_SKILLS.has(options.skill)) {
    delete options.skill
  }

  if ('videoType' in options && !findStyle(options.videoType)) delete options.videoType

  if ('narrationVoice' in options) {
    const voice = options.narrationVoice
    if (
      voice?.provider === 'elevenlabs' &&
      typeof voice.id === 'string' &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(voice.id)
    ) {
      options.narrationVoice = {
        provider: 'elevenlabs',
        id: voice.id,
        name: typeof voice.name === 'string' ? voice.name.trim().slice(0, 160) : voice.id,
      }
    } else {
      delete options.narrationVoice
    }
  }

  if ('durationSeconds' in options) {
    const duration = Number(options.durationSeconds)
    if (Number.isFinite(duration) && duration >= 3 && duration <= 300) {
      options.durationSeconds = Math.round(duration)
    } else {
      delete options.durationSeconds
    }
  }

  if ('referenceVideoFiles' in options) {
    options.referenceVideoFiles = Array.isArray(options.referenceVideoFiles)
      ? options.referenceVideoFiles
          .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0)
          .slice(0, 10)
          .map((name: string) => path.basename(name))
      : []
  }

  return options
}

/** Pull a duration from a user brief or an answer emitted by the question card. */
export function durationOptionFromText(text: string): { durationSeconds: number } | undefined {
  const lines = text.split('\n')
  const duration = /(?:~|about\s*)?(\d{1,3})\s*(?:s|sec(?:ond)?s?)\b/i
  const relevant = lines.find(line => /(?:length|duration|long)/i.test(line) && duration.test(line))
  const match = duration.exec(relevant ?? text)
  if (!match) return undefined
  const durationSeconds = Number(match[1])
  return durationSeconds >= 3 && durationSeconds <= 300 ? { durationSeconds } : undefined
}

export function videoTypeOptionFromText(text: string): { videoType: string } | undefined {
  const style = styleNamedIn(text, [
    'product-walkthrough',
    'teaser',
    'cinematic',
    'motion-3d',
    'full-walkthrough',
    'feature-spotlight',
    'onboarding-tour',
    'how-to',
    'sales-demo',
  ])
  return style ? { videoType: style.id } : undefined
}
