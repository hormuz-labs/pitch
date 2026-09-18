export const MIN_TIMELINE_HEIGHT = 180
export const TIMELINE_HEIGHT_ALLOWANCE = 30

export function timelineRowsHeight(rows: ArrayLike<Pick<HTMLElement, 'offsetHeight'>>): number {
  return Array.from(rows).reduce((total, row) => total + row.offsetHeight, 0)
}

export function timelineHeightLimit(
  stageHeight: number,
  rowsHeight: number,
  toolbarHeight: number,
): number {
  const available = Math.max(MIN_TIMELINE_HEIGHT, stageHeight - 200)
  const useful = Math.max(
    MIN_TIMELINE_HEIGHT,
    rowsHeight + toolbarHeight + TIMELINE_HEIGHT_ALLOWANCE,
  )
  return Math.min(available, useful)
}

export function clampTimelineHeight(height: number, maximum: number): number {
  return Math.max(MIN_TIMELINE_HEIGHT, Math.min(height, maximum))
}
