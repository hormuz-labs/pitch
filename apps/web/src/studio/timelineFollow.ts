interface TimelineFollowInput {
  contentX: number
  scrollLeft: number
  viewportWidth: number
  scrollWidth: number
  leadingInset: number
  playing: boolean
}

/**
 * Keep the playhead in a comfortable horizontal safe zone without moving the
 * page. During playback it rides at roughly two thirds of the usable canvas;
 * a paused seek only recentres when the playhead is actually out of view.
 */
export function timelineFollowScrollLeft({
  contentX,
  scrollLeft,
  viewportWidth,
  scrollWidth,
  leadingInset,
  playing,
}: TimelineFollowInput): number | null {
  if (viewportWidth <= 0 || scrollWidth <= viewportWidth) return null

  const usableWidth = Math.max(1, viewportWidth - leadingInset)
  const viewportX = contentX - scrollLeft
  const safeLeft = leadingInset + Math.min(72, usableWidth * 0.14)
  const safeRight = viewportWidth - Math.min(88, usableWidth * 0.16)

  if (viewportX >= safeLeft && viewportX <= safeRight) return null

  const anchor = playing ? leadingInset + usableWidth * 0.64 : leadingInset + usableWidth * 0.5
  const maxScroll = Math.max(0, scrollWidth - viewportWidth)
  return Math.min(maxScroll, Math.max(0, contentX - anchor))
}
