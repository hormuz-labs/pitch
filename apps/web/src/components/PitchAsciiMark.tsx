/**
 * The Pitch "P" rendered as a field of ASCII glyphs that breathe and rotate
 * through glyph families. Extracted from src/assets/pitch-ascii-animation.html
 * so status pages can share one implementation.
 *
 * Differences from the original standalone file: the canvas paints on a
 * transparent ground (so it inherits whatever surface it sits on), scales for
 * devicePixelRatio, and stops animating when it is off-screen, when the tab is
 * hidden, or when the visitor asks for reduced motion — a decorative loop is
 * not worth a permanent rAF on a page someone landed on by accident.
 */
import { useEffect, useRef } from 'react'

// P pixel-block geometry, in the mark's own 200x200 coordinate space.
const BLOCKS: { x: number; y: number; w: number; h: number }[] = []
{
  const xs = [53, 86, 119]
  const ys = [45, 68, 91, 114, 137]
  const rows = [[0, 1, 2], [0, 2], [0, 1, 2], [0], [0]]
  rows.forEach((cols, r) => {
    for (const c of cols) BLOCKS.push({ x: xs[c], y: ys[r], w: 28, h: 18 })
  })
}

const GLYPH_FAMILIES = [
  ['.', '▵', '▴', '▲'],
  ['.', '·', '•', '●'],
  ['.', ':', '+', '#'],
  ['.', '·', '*', '✳'],
]

const CELL = 13
const BLOOM = 5
const LOGO_UNITS = 200

/** Distance from a point to the nearest block, in logo units. */
function distanceToMark(px: number, py: number): number {
  let min = Infinity
  for (const b of BLOCKS) {
    const dx = Math.max(b.x - px, 0, px - (b.x + b.w))
    const dy = Math.max(b.y - py, 0, py - (b.y + b.h))
    const d = Math.hypot(dx, dy)
    if (d < min) min = d
  }
  return min
}

/** Stable per-cell noise so the dither pattern does not crawl between frames. */
function hash(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

interface Props {
  /** Rendered size in CSS pixels. The mark is always square. */
  size?: number
  className?: string
}

export const PitchAsciiMark = ({ size = 320, className }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scale = (size / LOGO_UNITS) * 1.42
    const offset = (size - LOGO_UNITS * scale) / 2
    const cells = Math.ceil(size / CELL)

    const draw = (t: number) => {
      // Transparent ground: the glyphs are the whole drawing, so the page's own
      // surface (and its dark-mode variant) shows through.
      ctx.clearRect(0, 0, size, size)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${Math.round(CELL * 0.92)}px ui-monospace, Menlo, monospace`
      ctx.fillStyle = getComputedStyle(canvas).color

      const period = 9
      const phase = ((t % period) / period) * Math.PI * 2

      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const cx = i * CELL + CELL / 2
          const cy = j * CELL + CELL / 2
          const px = (cx - offset) / scale
          const py = (cy - offset) / scale
          const d = distanceToMark(px, py)
          const core = d <= 0 ? 1 : Math.max(0, 1 - d / BLOOM) ** 2.2 * 0.75
          if (core <= 0.001) continue

          const wave = 0.5 + 0.5 * Math.sin(px * 0.05 + py * 0.032 - phase * 2)
          const breathe = 0.5 + 0.5 * Math.sin(phase)
          const nz = hash(i, j)
          const solid = Math.sqrt(core)
          const val =
            solid * (0.72 + 0.28 * wave) * (0.88 + 0.12 * breathe) - nz * 0.18 * (1 - core)
          if (val < 0.1) continue

          const angle = Math.atan2(py - 100, px - 100) + phase + nz * 0.5
          const family = GLYPH_FAMILIES[((((angle / (Math.PI / 2)) | 0) % 4) + 4) % 4]
          const level = Math.min(3, Math.max(0, Math.floor(val * 4.2)))
          ctx.globalAlpha = Math.min(1, 0.48 + val * 1.05)
          ctx.fillText(family[level], cx, cy)
        }
      }
      ctx.globalAlpha = 1
    }

    draw(0)
    if (reduceMotion) return

    let frame = 0
    let running = false
    const tick = (ts: number) => {
      draw(ts / 1000)
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (running) return
      running = true
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (!running) return
      running = false
      cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) start()
      else stop()
    })
    observer.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: 'block' }}
      aria-hidden="true"
    />
  )
}
