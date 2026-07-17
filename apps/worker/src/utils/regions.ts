/**
 * regions.ts
 *
 * Pure, dependency-free helpers that turn raw word-position output — from
 * `pdftotext -bbox` (PDF pages) or `tesseract ... tsv` (images) — into
 * percent-of-page "regions": phrase-level hotspots the demo agent can target
 * with zoom_in / annotate. Kept pure so they're unit-testable without poppler,
 * tesseract, or a browser.
 *
 * Coordinate convention: all inputs use a top-left origin (y grows downward),
 * matching CSS/image space, so no vertical flip is needed. Outputs are in
 * percent of the page/image so the slideshow can position them with no JS
 * measurement (see build_slideshow).
 */

export interface Region {
  id: string
  text: string
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export interface WordBox {
  text: string
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}

export interface PageWords {
  width: number
  height: number
  words: WordBox[]
}

export interface GroupOptions {
  /** Fraction of a page dimension used as the id prefix (e.g. page index). */
  idPrefix?: string
  /** Max regions kept per page (densest/longest lines win). */
  maxRegions?: number
  /** Horizontal gap (fraction of page width) that splits a line into columns. */
  columnGapFrac?: number
}

const DEFAULT_MAX_REGIONS = 40
const DEFAULT_COLUMN_GAP_FRAC = 0.06

const clampPct = (v: number): number => Math.max(0, Math.min(100, v))

/** Decode the handful of XML entities pdftotext -bbox emits. */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/**
 * Parse the XHTML that `pdftotext -bbox` writes to stdout. Returns one entry
 * per <page>, in document order (page 0 = first PDF page).
 */
export function parsePdfBbox(xml: string): PageWords[] {
  const pages: PageWords[] = []
  const pageRe =
    /<page\b[^>]*\bwidth="([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"[^>]*\bheight="([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"[^>]*>([\s\S]*?)<\/page>/g
  const wordRe =
    /<word\b[^>]*\bxMin="([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"[^>]*\byMin="([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"[^>]*\bxMax="([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"[^>]*\byMax="([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"[^>]*>([\s\S]*?)<\/word>/g

  let pageMatch: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((pageMatch = pageRe.exec(xml)) !== null) {
    const width = parseFloat(pageMatch[1]!)
    const height = parseFloat(pageMatch[2]!)
    const body = pageMatch[3]!
    const words: WordBox[] = []
    let wm: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
    while ((wm = wordRe.exec(body)) !== null) {
      const text = decodeXmlEntities(wm[5]!).trim()
      if (!text) continue
      words.push({
        xMin: parseFloat(wm[1]!),
        yMin: parseFloat(wm[2]!),
        xMax: parseFloat(wm[3]!),
        yMax: parseFloat(wm[4]!),
        text,
      })
    }
    pages.push({ width, height, words })
  }
  return pages
}

/**
 * Parse `tesseract <img> stdout tsv`. Keeps word-level rows (level 5) above the
 * confidence floor. Coordinates are pixels; caller supplies image dimensions.
 */
export function parseTesseractTsv(tsv: string, minConf = 40): WordBox[] {
  const lines = tsv.split(/\r?\n/)
  const words: WordBox[] = []
  for (const line of lines) {
    const cols = line.split('\t')
    if (cols.length < 12) continue
    const level = parseInt(cols[0]!, 10)
    if (level !== 5) continue // 5 = word
    const conf = parseFloat(cols[10]!)
    if (!Number.isFinite(conf) || conf < minConf) continue
    const text = (cols[11] ?? '').trim()
    if (!text) continue
    const left = parseFloat(cols[6]!)
    const top = parseFloat(cols[7]!)
    const width = parseFloat(cols[8]!)
    const height = parseFloat(cols[9]!)
    if (![left, top, width, height].every(Number.isFinite)) continue
    words.push({ text, xMin: left, yMin: top, xMax: left + width, yMax: top + height })
  }
  return words
}

/** Median of a numeric list (0 for empty). */
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Cluster words into phrase-level regions: words sharing a line merge into one
 * hotspot (so a label reads "Full Name", not "Full" + "Name"); a wide
 * horizontal gap splits a line into separate columns. Returns regions in
 * percent-of-page, in reading order, capped to `maxRegions` (longest lines win).
 */
export function groupWordsIntoRegions(page: PageWords, opts: GroupOptions = {}): Region[] {
  const { width, height, words } = page
  if (!width || !height || words.length === 0) return []

  const prefix = opts.idPrefix ?? 'r'
  const maxRegions = opts.maxRegions ?? DEFAULT_MAX_REGIONS
  const columnGap = (opts.columnGapFrac ?? DEFAULT_COLUMN_GAP_FRAC) * width

  const medianHeight = median(words.map(w => w.yMax - w.yMin))
  const lineTolerance = Math.max(1, medianHeight * 0.6)

  // Sort top-to-bottom, then left-to-right.
  const sorted = [...words].sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)

  // Bucket into lines by vertical center proximity.
  const lines: WordBox[][] = []
  for (const w of sorted) {
    const center = (w.yMin + w.yMax) / 2
    const line = lines[lines.length - 1]
    if (line) {
      const last = line[line.length - 1]!
      const lastCenter = (last.yMin + last.yMax) / 2
      if (Math.abs(center - lastCenter) <= lineTolerance) {
        line.push(w)
        continue
      }
    }
    lines.push([w])
  }

  // Within each line, split on large horizontal gaps, then merge into phrases.
  const phrases: WordBox[] = []
  for (const line of lines) {
    const byX = [...line].sort((a, b) => a.xMin - b.xMin)
    let group: WordBox[] = []
    const flush = () => {
      if (group.length === 0) return
      phrases.push({
        text: group.map(g => g.text).join(' '),
        xMin: Math.min(...group.map(g => g.xMin)),
        yMin: Math.min(...group.map(g => g.yMin)),
        xMax: Math.max(...group.map(g => g.xMax)),
        yMax: Math.max(...group.map(g => g.yMax)),
      })
      group = []
    }
    for (const w of byX) {
      const prev = group[group.length - 1]
      if (prev && w.xMin - prev.xMax > columnGap) flush()
      group.push(w)
    }
    flush()
  }

  // Cap: keep the longest phrases (most informative), then restore reading order.
  const kept =
    phrases.length > maxRegions
      ? [...phrases].sort((a, b) => b.text.length - a.text.length).slice(0, maxRegions)
      : phrases
  kept.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)

  return kept.map((p, i) => {
    const leftPct = clampPct((p.xMin / width) * 100)
    const topPct = clampPct((p.yMin / height) * 100)
    const rightPct = clampPct((p.xMax / width) * 100)
    const bottomPct = clampPct((p.yMax / height) * 100)
    return {
      id: `${prefix}${i}`,
      text: p.text,
      leftPct,
      topPct,
      widthPct: Math.max(0, rightPct - leftPct),
      heightPct: Math.max(0, bottomPct - topPct),
    }
  })
}
