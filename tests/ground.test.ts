/**
 * The audit's ground note: films set on the stock dark grey-blue that the
 * product's measured colours don't include.
 */
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  colourAudit,
  colourLiterals,
  groundOf,
  isEmptyFrame,
  isStockNavy,
  measuredBrandColours,
  schemeGroundIssue,
  stockGroundNote,
} from '../.pi/scripts/launch-video/lib/ground.mjs'

/** A solid RGB frame with a differently coloured centre block. */
function frame(w: number, h: number, ground: number[], centre: number[]) {
  const data = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75
      data.set(inside ? centre : ground, (y * w + x) * 3)
    }
  return { width: w, height: h, channels: 3, data }
}

/** Minimal PNG encoder (8-bit RGB, filter 0) for the note's PNG input. */
function png({ width, height, data }: ReturnType<typeof frame>) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(body.length)
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(tb))
    return Buffer.concat([len, tb, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++)
    Buffer.from(data.subarray(y * width * 3, (y + 1) * width * 3)).copy(
      raw,
      y * (width * 3 + 1) + 1,
    )
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const NAVY = [0x0e, 0x15, 0x25]
const ORANGE = [0xf2, 0x62, 0x07]

describe('groundOf', () => {
  it('reads the outer band, not the subject in the middle', () => {
    const g = groundOf(frame(200, 120, NAVY, ORANGE))
    expect(g).toMatchObject({ r: 0x0e, g: 0x15, b: 0x25 })
  })
})

describe('isStockNavy', () => {
  it('knows the dark grey-blue from black, white and real colours', () => {
    expect(isStockNavy({ r: 0x0e, g: 0x15, b: 0x25 })).toBe(true)
    expect(isStockNavy({ r: 0x0b, g: 0x1b, b: 0x2b })).toBe(true)
    expect(isStockNavy({ r: 0, g: 0, b: 0 })).toBe(false)
    expect(isStockNavy({ r: 0x11, g: 0x11, b: 0x11 })).toBe(false)
    expect(isStockNavy({ r: 0xf7, g: 0xf7, b: 0xf4 })).toBe(false)
    expect(isStockNavy({ r: 0x0b, g: 0x3d, b: 0x2e })).toBe(false)
  })
})

describe('stockGroundNote', () => {
  const navyFilm = Array.from({ length: 4 }, () => png(frame(160, 90, NAVY, ORANGE)))

  it('notes a navy film when recon never ran', () => {
    expect(stockGroundNote(navyFilm, null)).toMatch(/recon never ran/)
  })

  it('stays quiet when recon measured that navy on the product', () => {
    const recon = { colors: { bg: '#0E1525', surfaces: [{ hex: '#1C2333' }] } }
    expect(measuredBrandColours(recon)).toHaveLength(2)
    expect(stockGroundNote(navyFilm, recon)).toBeNull()
  })

  it('stays quiet on a light film', () => {
    const light = Array.from({ length: 4 }, () => png(frame(160, 90, [0xf7, 0xf7, 0xf4], NAVY)))
    expect(stockGroundNote(light, null)).toBeNull()
  })
})

// A white-led site with one dark card, as recon measured trypitch.co.
const lightSite = {
  colors: {
    bg: '#FFFFFF',
    ink: '#202020',
    accent: '#1385D6',
    surfaces: [{ hex: '#FFFFFF' }, { hex: '#111111' }, { hex: '#F6F6F6' }],
    saturated: [{ hex: '#1385D6' }],
    gradients: ['linear-gradient(158deg, rgb(27, 27, 31), rgb(10, 10, 12))'],
  },
}

describe('schemeGroundIssue', () => {
  const dark = Array.from({ length: 4 }, () => png(frame(160, 90, [8, 8, 11], [255, 255, 255])))

  it('fails a dark film for a light site, however close its dark is to a card on it', () => {
    expect(schemeGroundIssue(dark, lightSite, undefined)).toMatch(/site is light .* sit on dark/)
  })

  it('accepts a dark film the user asked for', () => {
    expect(schemeGroundIssue(dark, lightSite, 'dark')).toBeNull()
  })

  it('accepts a light film for a light site', () => {
    const light = Array.from({ length: 4 }, () =>
      png(frame(160, 90, [255, 255, 255], [17, 17, 17])),
    )
    expect(schemeGroundIssue(light, lightSite, undefined)).toBeNull()
  })
})

describe('colourAudit', () => {
  it('reads colour values, not id selectors', () => {
    expect(
      colourLiterals('#camera { color: #1385d6; background: rgba(0, 0, 0, .5) } #bed {'),
    ).toEqual([
      { r: 0x13, g: 0x85, b: 0xd6 },
      { r: 0, g: 0, b: 0 },
    ])
  })

  it('fails invented colours and reports declared ones as authored', () => {
    const code = [
      {
        file: 'css/shots/a.css',
        text: '.a{color:#94A3B8;background:#1385D6;border:1px solid rgba(255,255,255,.1)} .b{color:#60B8FF}',
      },
    ]
    const { unmeasured, authored } = colourAudit(code, lightSite, { glow: '#60B8FF' })
    expect(unmeasured).toEqual([{ colour: '#94A3B8', files: ['css/shots/a.css'] }])
    expect(authored).toEqual(['glow #60B8FF'])
  })
})

describe('isEmptyFrame', () => {
  it('knows a flat frame from a picture', () => {
    const flat = new Uint8Array(160 * 90 * 3).fill(10)
    expect(isEmptyFrame(png({ width: 160, height: 90, channels: 3, data: flat }))).toBe(true)
    expect(isEmptyFrame(png(frame(160, 90, [10, 10, 10], [255, 255, 255])))).toBe(false)
  })
})
