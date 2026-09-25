// Server-owned rasterization of tiny sprites, never a full-frame cursor movie.
// The arrow reuses Pitch's bundled cursor asset; typography fonts are not cursors.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const [folder, width] = process.argv.slice(2)
const scale = Math.max(0.5, Number(width) / 1920)
if (!folder || !Number.isFinite(scale) || scale > 4) throw new Error('Invalid cursor sprite size')
const size = Math.ceil(64 * scale)
const arrow = readFileSync(new URL('../../../../../assets/icons/cursor.svg', import.meta.url), 'utf8')
  .match(/<path d="([^"]+)"/)[1]
const shapes = {
  arrow: `<g transform="translate(11 11) scale(1.5)"><path d="${arrow}"/></g>`,
  // Rounded fingertip is the hotspot (16,16). The palm remains below the target.
  hand: '<path d="M13.3 30V18.8C13.3 15.1 18.7 15.1 18.7 18.8V27.2C19.6 23.9 23.9 24.4 24 27.5C25.3 24.9 29.1 25.8 29.2 28.7C30.6 26.7 34.3 27.4 34.3 30.5V35.4C34.3 39.8 31.5 44 27.5 44H21.4C18.5 44 16.4 41.4 14.9 39.2L9 31.2C7 28.4 10.8 25.6 13.3 30Z"/>',
  // I-beam centred on the actual insertion point.
  text: '<path d="M10 4H14L16 6L18 4H22V7H19L18 8V24L19 25H22V28H18L16 26L14 28H10V25H13L14 24V8L13 7H10Z"/>',
}
for (const [name, shape] of Object.entries(shapes)) {
  for (const pressed of [false, true]) {
    const transform = pressed ? 'translate(16 16) scale(.94) translate(-16 -16)' : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <defs><filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.25" flood-color="#0f172a" flood-opacity=".35"/>
      </filter></defs><g transform="${transform}" fill="${pressed ? '#cbd5e1' : '#fff'}"
        stroke="#17202e" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">${shape}</g></svg>`
    writeFileSync(join(folder, `${name}${pressed ? '-pressed' : ''}.png`), new Resvg(svg).render().asPng())
  }
}
console.log(JSON.stringify({ size, hotspot: 16 * scale }))
