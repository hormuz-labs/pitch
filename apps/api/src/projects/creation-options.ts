import path from 'node:path'

const STUDIO_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:5'])

/** Keep composer preferences predictable before they reach project.json and agent context. */
export function normalizeCreationOptions(value: unknown): Record<string, any> {
  const options =
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, any>) }
      : {}

  if ('aspectRatio' in options && !STUDIO_ASPECT_RATIOS.has(options.aspectRatio)) {
    delete options.aspectRatio
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
