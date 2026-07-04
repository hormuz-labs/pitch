/**
 * Generates the original demo-background pack (no third-party assets).
 *
 *   - Static gradients  -> assets/backgrounds/<id>.png   (1920x1080)
 *   - Animated loops    -> assets/backgrounds/<id>.mp4   (1920x1080, ~8s loop)
 *   - Thumbnails        -> apps/web/public/backgrounds/<id>.jpg (320x180)
 *
 * Run: bun scripts/generate-backgrounds.ts
 */
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { Resvg } from '@resvg/resvg-js'

const W = 1920
const H = 1080
const ROOT = process.cwd() // run from the repo root: bun scripts/generate-backgrounds.ts
const BG_DIR = path.join(ROOT, 'assets', 'backgrounds')
const THUMB_DIR = path.join(ROOT, 'apps', 'web', 'public', 'backgrounds')
fs.mkdirSync(BG_DIR, { recursive: true })
fs.mkdirSync(THUMB_DIR, { recursive: true })

const sh = (cmd: string) => execSync(cmd, { stdio: 'pipe' })

function svgToPng(svg: string, out: string, w = W) {
  fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng())
}

// A smooth diagonal gradient image.
function gradientSvg(stops: { off: number; color: string }[]): string {
  const s = stops.map(p => `<stop offset="${p.off}%" stop-color="${p.color}"/>`).join('')
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${s}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`
}

// ── Static gradient backgrounds ──────────────────────────────────────────────
const STATIC: { id: string; stops: { off: number; color: string }[] }[] = [
  { id: 'sunset', stops: [
    { off: 0, color: '#1a0b2e' }, { off: 45, color: '#3a1d5c' },
    { off: 72, color: '#ff7a3d' }, { off: 100, color: '#ffd36b' },
  ] },
  { id: 'aurora', stops: [
    { off: 0, color: '#0c1f2b' }, { off: 40, color: '#14b8a6' },
    { off: 75, color: '#6d4aff' }, { off: 100, color: '#ff5db1' },
  ] },
  { id: 'ocean', stops: [
    { off: 0, color: '#04122b' }, { off: 50, color: '#0b4a8f' }, { off: 100, color: '#27c2e6' },
  ] },
]

// ── Animated mesh backgrounds: soft color blobs that slowly rotate a full turn
//    (seamless loop, gentle flowing motion). ─────────────────────────────────
type Blob = { c: string; x: number; y: number } // x/y as % of the canvas
const ANIMATED: { id: string; base: string; blobs: Blob[] }[] = [
  { id: 'drift-violet', base: '#140826', blobs: [
    { c: '#6d4aff', x: 28, y: 32 }, { c: '#ff5db1', x: 74, y: 66 }, { c: '#3b82f6', x: 62, y: 20 },
  ] },
  { id: 'drift-ember', base: '#1a0b0b', blobs: [
    { c: '#ff6a2b', x: 26, y: 34 }, { c: '#ffd36b', x: 72, y: 60 }, { c: '#c2410c', x: 56, y: 24 },
  ] },
  { id: 'drift-mint', base: '#06201c', blobs: [
    { c: '#14b8a6', x: 30, y: 34 }, { c: '#9cff6b', x: 70, y: 62 }, { c: '#22d3ee', x: 58, y: 22 },
  ] },
]

// Oversized so any rotation still fully covers the 1920x1080 centre crop
// (>= the 1920x1080 diagonal of ~2203).
const MESH = 2208
const DUR = 16 // seconds for one full, gentle rotation

function meshSvg(base: string, blobs: Blob[]): string {
  const r = Math.round(MESH * 0.5)
  const defs = blobs
    .map(
      (b, i) =>
        `<radialGradient id="b${i}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${b.c}" stop-opacity="0.95"/><stop offset="100%" stop-color="${b.c}" stop-opacity="0"/></radialGradient>`,
    )
    .join('')
  const circles = blobs
    .map(
      (b, i) =>
        `<circle cx="${(b.x / 100) * MESH}" cy="${(b.y / 100) * MESH}" r="${r}" fill="url(#b${i})"/>`,
    )
    .join('')
  return `<svg width="${MESH}" height="${MESH}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs><rect width="${MESH}" height="${MESH}" fill="${base}"/>${circles}</svg>`
}

for (const b of STATIC) {
  const png = path.join(BG_DIR, `${b.id}.png`)
  svgToPng(gradientSvg(b.stops), png)
  sh(`ffmpeg -y -loglevel error -i "${png}" -vf scale=320:180 "${path.join(THUMB_DIR, `${b.id}.jpg`)}"`)
  console.log('static', b.id)
}

for (const b of ANIMATED) {
  const mp4 = path.join(BG_DIR, `${b.id}.mp4`)
  const meshPng = path.join(BG_DIR, `__mesh_${b.id}.png`)
  svgToPng(meshSvg(b.base, b.blobs), meshPng, MESH)
  // Loop the mesh, rotate one full turn over DUR (seamless), crop the centre.
  sh(
    `ffmpeg -y -loglevel error -loop 1 -t ${DUR} -i "${meshPng}" ` +
      `-vf "rotate=2*PI*t/${DUR}:ow=${MESH}:oh=${MESH}:c=black,crop=${W}:${H},format=yuv420p" ` +
      `-r 30 -c:v libx264 -preset veryfast -crf 22 -t ${DUR} -movflags +faststart "${mp4}"`,
  )
  fs.rmSync(meshPng, { force: true })
  sh(`ffmpeg -y -loglevel error -i "${mp4}" -vf scale=320:180 -frames:v 1 "${path.join(THUMB_DIR, `${b.id}.jpg`)}"`)
  // Small, muted web preview loop so the picker can play the animation.
  sh(
    `ffmpeg -y -loglevel error -i "${mp4}" -vf scale=960:540 -an -c:v libx264 -preset slow -crf 30 -movflags +faststart "${path.join(THUMB_DIR, `${b.id}.mp4`)}"`,
  )
  console.log('animated', b.id)
}

console.log('Done.')
