// Deck stage sizing. The deck document is a vertical stack of 1280×720
// slides; the stage must fit ONE whole slide (both axes) so a slide is never
// cut off, while the iframe itself keeps the full stage height for scrolling
// between slides.
export const SLIDE_W = 1280
export const SLIDE_H = 720

/**
 * Scale that fits one full slide into availW × availH. Never upscales past 1,
 * never shrinks below 0.1. An unmeasured (zero) stage keeps the 0.5 default.
 */
export function fitScale(availW: number, availH: number): number {
  if (!(availW > 0) || !(availH > 0)) return 0.5
  return Math.max(0.1, Math.min(1, Math.min(availW / SLIDE_W, availH / SLIDE_H)))
}
