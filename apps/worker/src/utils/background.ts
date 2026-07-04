/**
 * background.ts
 *
 * Assets and geometry for framing the demo on a decorative background: the demo is
 * scaled down, given rounded corners + a soft drop shadow, and centered on the
 * chosen background (a static gradient image or an animated loop). The actual
 * compositing happens inside the final assemble pass in intro-outro.ts, so the
 * framing costs no extra encode generation. When no background is selected the
 * demo is left full-screen (this module isn't called).
 */
import * as fs from 'fs'
import * as path from 'path'
import { Resvg } from '@resvg/resvg-js'

// Corner shapes for the framed demo.
export type FrameShape = 'square' | 'rounded' | 'soft'
const SHAPE_RADIUS: Record<FrameShape, number> = { square: 0, rounded: 26, soft: 56 }
export function shapeRadius(shape: string | undefined): number {
  return SHAPE_RADIUS[(shape as FrameShape) in SHAPE_RADIUS ? (shape as FrameShape) : 'rounded']
}

function svgToPng(svg: string, out: string, width: number): void {
  fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng())
}

/** Resolve a background asset path for a given id, or null if it doesn't exist. */
export function resolveBackgroundAsset(
  backgroundsDir: string,
  id: string,
): { path: string; isVideo: boolean } | null {
  const mp4 = path.join(backgroundsDir, `${id}.mp4`)
  if (fs.existsSync(mp4)) return { path: mp4, isVideo: true }
  const png = path.join(backgroundsDir, `${id}.png`)
  if (fs.existsSync(png)) return { path: png, isVideo: false }
  return null
}

export interface BackgroundFrame {
  /** Rounded-corner alpha mask PNG (white rounded rect on black), at the inset size. */
  maskPng: string
  /** Full-frame soft drop-shadow PNG to composite under the demo. */
  shadowPng: string
  /** Inset demo size and position within the full frame. */
  iw: number
  ih: number
  ix: number
  iy: number
}

/**
 * Compute the framed-demo geometry and render the mask + shadow PNGs used to
 * composite it. `inset` is the fraction of the frame the demo fills. The caller
 * owns cleanup of the returned PNG files.
 */
export function prepareBackgroundFrame(
  dir: string,
  width: number,
  height: number,
  radius = 26,
  inset = 0.87,
): BackgroundFrame {
  const stamp = Date.now()
  const maskPng = path.join(dir, `__bgmask_${stamp}.png`)
  const shadowPng = path.join(dir, `__bgshadow_${stamp}.png`)

  const scale = Math.max(0.6, Math.min(0.98, inset))
  const iw = Math.round((width * scale) / 2) * 2
  const ih = Math.round((height * scale) / 2) * 2
  const ix = Math.round((width - iw) / 2)
  const iy = Math.round((height - ih) / 2)

  svgToPng(
    `<svg width="${iw}" height="${ih}" xmlns="http://www.w3.org/2000/svg"><rect width="${iw}" height="${ih}" fill="black"/><rect width="${iw}" height="${ih}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
    maskPng,
    iw,
  )
  svgToPng(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="34"/></filter></defs><rect x="${ix}" y="${iy + 16}" width="${iw}" height="${ih}" rx="${radius}" ry="${radius}" fill="black" fill-opacity="0.5" filter="url(#b)"/></svg>`,
    shadowPng,
    width,
  )

  return { maskPng, shadowPng, iw, ih, ix, iy }
}
