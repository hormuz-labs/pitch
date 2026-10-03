/** What a caller asks of an asset thumbnail (projects/assets.ts assetThumbnail). */
export interface ThumbRequest {
  /** Workspace-relative path of the asset. */
  path: string
  /** Seconds into a video, or the 1-based page of a PDF. */
  at?: number
  /** Pixel width, snapped up to one of the sizes assetThumbnail renders (default 320). */
  width?: number
}

/** A thumbnail request from a query string: `path`, `at`, `w`. */
export function thumbRequestOf(query: Record<string, unknown>): ThumbRequest {
  const at = query.at === undefined ? Number.NaN : Number(query.at)
  const width = query.w === undefined ? Number.NaN : Number(query.w)
  return {
    path: String(query.path ?? ''),
    ...(Number.isFinite(at) ? { at } : {}),
    ...(Number.isFinite(width) ? { width } : {}),
  }
}
