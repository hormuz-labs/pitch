/**
 * Unit tests for the pure region-extraction helpers (no poppler/tesseract/browser).
 */

import { describe, expect, it } from 'vitest'
import {
  decodeXmlEntities,
  groupWordsIntoRegions,
  type PageWords,
  parsePdfBbox,
  parseTesseractTsv,
} from '../apps/worker/src/utils/regions.js'

const SAMPLE_BBOX = `<?xml version="1.0"?>
<html><body><doc>
  <page width="612.000000" height="792.000000">
    <word xMin="72.000000" yMin="74.768000" xMax="110.664000" yMax="96.968000">Full</word>
    <word xMin="117.336000" yMin="74.768000" xMax="181.344000" yMax="96.968000">Name</word>
    <word xMin="72.000000" yMin="114.768000" xMax="129.360000" yMax="136.968000">Voter</word>
    <word xMin="136.032000" yMin="114.768000" xMax="252.048000" yMax="136.968000">ID &amp; PIN</word>
  </page>
  <page width="612.000000" height="792.000000">
    <word xMin="72.000000" yMin="74.000000" xMax="120.000000" yMax="96.000000">Page2</word>
  </page>
</doc></body></html>`

describe('decodeXmlEntities', () => {
  it('decodes the entities pdftotext emits', () => {
    expect(decodeXmlEntities('A &amp; B &lt;x&gt; &quot;q&quot; &#39;s')).toBe(`A & B <x> "q" 's`)
  })
})

describe('parsePdfBbox', () => {
  it('parses pages and words with decoded text', () => {
    const pages = parsePdfBbox(SAMPLE_BBOX)
    expect(pages).toHaveLength(2)
    expect(pages[0].width).toBe(612)
    expect(pages[0].height).toBe(792)
    expect(pages[0].words).toHaveLength(4)
    expect(pages[0].words[3].text).toBe('ID & PIN')
    expect(pages[1].words).toHaveLength(1)
  })
})

describe('groupWordsIntoRegions', () => {
  it('merges words on the same line into phrases and maps to percent', () => {
    const page = parsePdfBbox(SAMPLE_BBOX)[0]
    const regions = groupWordsIntoRegions(page, { idPrefix: 'p0r' })
    // Two lines -> two regions.
    expect(regions).toHaveLength(2)
    const [line1, line2] = regions
    expect(line1.text).toBe('Full Name')
    expect(line2.text).toBe('Voter ID & PIN')
    // Percentages are within bounds and left edge maps from xMin=72/612.
    expect(line1.leftPct).toBeCloseTo((72 / 612) * 100, 3)
    for (const r of regions) {
      for (const v of [r.leftPct, r.topPct, r.widthPct, r.heightPct]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
      expect(r.id.startsWith('p0r')).toBe(true)
    }
  })

  it('splits a line into columns on a large horizontal gap', () => {
    const page: PageWords = {
      width: 1000,
      height: 100,
      words: [
        { text: 'Left', xMin: 10, yMin: 10, xMax: 100, yMax: 30 },
        { text: 'Label', xMin: 105, yMin: 10, xMax: 200, yMax: 30 },
        // Big gap (>6% of 1000 = >60px) before the next word starts a new column.
        { text: 'Right', xMin: 700, yMin: 10, xMax: 800, yMax: 30 },
      ],
    }
    const regions = groupWordsIntoRegions(page)
    expect(regions).toHaveLength(2)
    expect(regions.map(r => r.text).sort()).toEqual(['Left Label', 'Right'])
  })

  it('caps the number of regions to maxRegions, keeping the longest', () => {
    const words = Array.from({ length: 10 }, (_, i) => ({
      text: 'x'.repeat(i + 1),
      xMin: 10,
      yMin: i * 40 + 10,
      xMax: 10 + (i + 1) * 5,
      yMax: i * 40 + 30,
    }))
    const regions = groupWordsIntoRegions({ width: 500, height: 500, words }, { maxRegions: 3 })
    expect(regions).toHaveLength(3)
    // The three longest phrases survive.
    const texts = regions.map(r => r.text)
    expect(texts).toContain('x'.repeat(10))
    expect(texts).toContain('x'.repeat(9))
    expect(texts).toContain('x'.repeat(8))
  })

  it('returns [] for an empty or zero-size page', () => {
    expect(groupWordsIntoRegions({ width: 0, height: 0, words: [] })).toEqual([])
  })
})

describe('parseTesseractTsv', () => {
  const TSV = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t800\t600\t-1\t',
    '5\t1\t1\t1\t1\t1\t10\t20\t60\t18\t96\tHello',
    '5\t1\t1\t1\t1\t2\t72\t20\t50\t18\t12\tnoise', // low conf -> dropped
    '5\t1\t1\t1\t1\t3\t80\t20\t40\t18\t90\tWorld',
  ].join('\n')

  it('keeps word rows above the confidence floor and converts to boxes', () => {
    const words = parseTesseractTsv(TSV)
    expect(words.map(w => w.text)).toEqual(['Hello', 'World'])
    expect(words[0]).toMatchObject({ xMin: 10, yMin: 20, xMax: 70, yMax: 38 })
  })

  it('groups OCR words into percent regions using image dims', () => {
    const words = parseTesseractTsv(TSV)
    const regions = groupWordsIntoRegions({ width: 800, height: 600, words })
    expect(regions).toHaveLength(1)
    expect(regions[0].text).toBe('Hello World')
  })
})
