export function modelMenuLeft(
  trigger: Pick<DOMRect, 'right'>,
  viewportWidth: number,
  viewportOffset = 0,
  preferredWidth = 420,
  gutter = 12,
) {
  const width = Math.max(0, Math.min(preferredWidth, viewportWidth - gutter * 2))
  const min = viewportOffset + gutter
  const max = viewportOffset + viewportWidth - width - gutter
  return Math.max(min, Math.min(trigger.right - width, max))
}
