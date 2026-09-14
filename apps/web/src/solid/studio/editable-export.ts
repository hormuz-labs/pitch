import type { ExportStatus } from './types'

export type ExportResolution = '720p' | '1080p' | '4k'
export type EditableFormat = 'premiere' | 'after-effects' | 'blender'
export type ExportRequest = { format?: EditableFormat | 'mp4'; res?: ExportResolution }

export function createExportRequest(
  run: (body: ExportRequest) => Promise<void>,
  blocked: () => boolean,
  pending: (value: boolean) => void,
) {
  let inFlight = false
  return async (body: ExportRequest = {}) => {
    if (inFlight || blocked()) return
    inFlight = true
    pending(true)
    try {
      await run(body)
    } finally {
      inFlight = false
      pending(false)
    }
  }
}

export function exportFilename(
  status: Pick<ExportStatus, 'format' | 'filename' | 'res' | 'url'>,
  title = 'export',
): string {
  if (status.filename) return status.filename
  const editable = ['premiere', 'after-effects', 'blender'].includes(status.format ?? '')
  const suffix = editable
    ? `-${status.format}.zip`
    : `.${/\.(zip|pdf)(?:$|[?#])/i.exec(status.url ?? '')?.[1].toLowerCase() ?? 'mp4'}`
  return `${title}${status.res ? `-${status.res}` : ''}${suffix}`
}
