import type { Output } from '../flows/types.js'

interface StorageUrlConfig {
  publicUrl?: string
  endpoint?: string
}

/**
 * Replace storage-internal origins that escaped into persisted project rows.
 * New uploads use MINIO_PUBLIC_URL directly; this keeps older outputs usable
 * after that configuration is corrected.
 */
export function normalizePublishedUrl(value: string, config: StorageUrlConfig = {}): string {
  const publicUrl = (config.publicUrl ?? process.env.MINIO_PUBLIC_URL)?.replace(/\/$/, '')
  if (!publicUrl) return value

  try {
    const candidate = new URL(value)
    const endpoint = config.endpoint ?? process.env.MINIO_ENDPOINT
    const endpointOrigin = endpoint ? new URL(endpoint).origin : null
    const isLoopbackMinio =
      ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname) &&
      ['9000', '9002'].includes(candidate.port)

    if (candidate.origin !== endpointOrigin && !isLoopbackMinio) return value
    return `${publicUrl}${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return value
  }
}

export function normalizePublishedOutputs(outputs: Output[]): Output[] {
  return outputs.map(output => ({ ...output, url: normalizePublishedUrl(output.url) }))
}
