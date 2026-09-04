#!/usr/bin/env node
/**
 * parse_presentation.js
 *
 * Parses a PDF or PPTX file and writes a structured slide JSON to disk.
 * For PPTX files in preserve mode, also extracts embedded media images.
 *
 * Usage:
 *   node parse_presentation.js \
 *     --input  /tmp/ppt-<jobId>/input.pdf \
 *     --jobId  <jobId> \
 *     --mode   recreate|preserve
 *
 * Output:
 *   /tmp/ppt-<jobId>/parsed-slides.json
 *   /tmp/ppt-<jobId>/input-images/  (preserve + pptx only)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : null
}

const inputPath = getArg('input')
const jobId = getArg('jobId')
const mode = getArg('mode') || 'recreate'

if (!inputPath || !jobId) {
  console.error('Usage: node parse_presentation.js --input <path> --jobId <id> [--mode recreate|preserve]')
  process.exit(1)
}

const buildDir = path.dirname(inputPath)
const outputPath = path.join(buildDir, 'parsed-slides.json')
const imagesDir = path.join(buildDir, 'input-images')

const ext = path.extname(inputPath).toLowerCase()

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Heuristically splits raw page text into a title and bullet array.
 * First non-empty line → title. Remaining non-empty lines → bullets.
 */
function splitPageText(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length === 0) return { title: 'Slide', bullets: [] }
  const [title, ...rest] = lines
  // Merge very short lines (< 15 chars) with the next — they are likely
  // broken word-wrap artefacts from the PDF renderer.
  const bullets = []
  let buffer = ''
  for (const line of rest) {
    if (buffer && line.length < 15) {
      buffer += ' ' + line
    } else {
      if (buffer) bullets.push(buffer)
      buffer = line
    }
  }
  if (buffer) bullets.push(buffer)
  return { title, bullets }
}

// ── PDF Parsing ───────────────────────────────────────────────────────────────
async function parsePdf() {
  console.log(`[parse] Reading PDF: ${inputPath}`)
  // pdf-parse is a CommonJS module; use createRequire for ESM compatibility
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const pdfParse = require('pdf-parse')

  const buffer = fs.readFileSync(inputPath)
  const data = await pdfParse(buffer)

  // pdf-parse exposes per-page text via data.text (whole doc) and
  // data.numpages; for per-page split we use the render_page callback.
  const pageTexts = []
  await pdfParse(buffer, {
    pagerender(pageData) {
      return pageData.getTextContent().then(tc => {
        const text = tc.items.map(i => i.str).join(' ')
        pageTexts.push(text)
        return text
      })
    },
  }).catch(() => {
    // If per-page render fails, fall back to splitting the full text by form-feed
    const fallbackPages = data.text.split('\f').filter(p => p.trim().length > 0)
    pageTexts.push(...fallbackPages)
  })

  // If pageTexts still empty (some encrypted PDFs), fall back to whole-doc split
  if (pageTexts.length === 0) {
    const fallback = data.text.split('\f').filter(p => p.trim().length > 0)
    pageTexts.push(...fallback)
  }

  const slides = pageTexts.map((text, i) => {
    const { title, bullets } = splitPageText(text)
    return {
      slideNumber: i + 1,
      title: title.slice(0, 120), // cap title length
      bullets: bullets.slice(0, 10).map(b => b.slice(0, 300)), // cap bullets
    }
  })

  console.log(`[parse] Extracted ${slides.length} slides from PDF`)
  return slides
}

// ── PPTX Parsing ─────────────────────────────────────────────────────────────
async function parsePptx() {
  console.log(`[parse] Reading PPTX: ${inputPath}`)
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const AdmZip = require('adm-zip')
  const { XMLParser } = await import('fast-xml-parser')

  const zip = new AdmZip(inputPath)
  const entries = zip.getEntries()

  // ── Image extraction (preserve mode only) ─────────────────────────────────
  if (mode === 'preserve') {
    fs.mkdirSync(imagesDir, { recursive: true })
    const RENDERABLE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    const mediaEntries = entries.filter(e =>
      e.entryName.startsWith('ppt/media/') && !e.isDirectory
    )
    for (const entry of mediaEntries) {
      const entryExt = path.extname(entry.name).toLowerCase()
      if (!RENDERABLE_EXTS.includes(entryExt)) continue // skip .emf, .wmf, etc.
      const destPath = path.join(imagesDir, entry.name)
      fs.writeFileSync(destPath, entry.getData())
      console.log(`[parse] Extracted image: ${entry.name}`)
    }
    console.log(`[parse] Image extraction complete → ${imagesDir}`)
  }

  // ── Slide XML parsing ──────────────────────────────────────────────────────
  const slideEntries = entries
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const numA = parseInt(a.name.replace('slide', '').replace('.xml', ''), 10)
      const numB = parseInt(b.name.replace('slide', '').replace('.xml', ''), 10)
      return numA - numB
    })

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

  // Build a slide-number → media filename map using slide relationships
  // (ppt/slides/_rels/slideN.xml.rels)
  const slideImageMap = {} // slideNumber → [filename, ...]

  const relEntries = entries.filter(e =>
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(e.entryName)
  )
  for (const relEntry of relEntries) {
    const slideNum = parseInt(
      relEntry.name.replace('slide', '').replace('.xml.rels', ''),
      10
    )
    const relXml = relEntry.getData().toString('utf8')
    const relParsed = parser.parse(relXml)
    const rels = relParsed?.Relationships?.Relationship || []
    const relsArr = Array.isArray(rels) ? rels : [rels]
    const imageRels = relsArr.filter(r =>
      r['@_Type']?.includes('/image') &&
      r['@_Target'] &&
      !r['@_Target'].startsWith('http')
    )
    if (imageRels.length > 0) {
      slideImageMap[slideNum] = imageRels.map(r => {
        // Target is like ../media/image1.png
        return path.basename(r['@_Target'])
      })
    }
  }

  // Extract text from each slide XML
  const slides = []
  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i]
    const slideNum = i + 1
    const xmlStr = entry.getData().toString('utf8')
    const parsed = parser.parse(xmlStr)

    // Collect all <a:t> text nodes recursively
    const texts = []
    function collectText(node) {
      if (!node || typeof node !== 'object') return
      if (typeof node['a:t'] === 'string') texts.push(node['a:t'])
      else if (Array.isArray(node['a:t'])) texts.push(...node['a:t'].filter(t => typeof t === 'string'))
      for (const key of Object.keys(node)) {
        if (key !== 'a:t') collectText(node[key])
      }
    }
    collectText(parsed)

    // Heuristic: first text node is title, rest are bullets
    const allText = texts.map(t => t.trim()).filter(t => t.length > 0)
    const title = (allText[0] || `Slide ${slideNum}`).slice(0, 120)
    const bullets = allText.slice(1, 11).map(b => b.slice(0, 300))

    // Resolved extracted image paths
    const extractedImages = mode === 'preserve' && slideImageMap[slideNum]
      ? slideImageMap[slideNum]
          .map(fname => path.join(imagesDir, fname))
          .filter(p => fs.existsSync(p))
      : []

    slides.push({
      slideNumber: slideNum,
      title,
      bullets,
      ...(extractedImages.length > 0 ? { extractedImages } : {}),
    })
  }

  console.log(`[parse] Extracted ${slides.length} slides from PPTX`)
  return slides
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`[parse] Input file not found: ${inputPath}`)
    process.exit(1)
  }

  let slides
  if (ext === '.pdf') {
    slides = await parsePdf()
  } else if (ext === '.pptx') {
    slides = await parsePptx()
  } else {
    console.error(`[parse] Unsupported file type: ${ext}. Must be .pdf or .pptx`)
    process.exit(1)
  }

  if (!slides || slides.length === 0) {
    console.error('[parse] No slides extracted. The file may be encrypted, corrupt, or empty.')
    process.exit(1)
  }

  fs.writeFileSync(outputPath, JSON.stringify(slides, null, 2))
  console.log(`[parse] ✅ Wrote ${slides.length} slides → ${outputPath}`)
}

main().catch(err => {
  console.error('[parse] Fatal error:', err.message || err)
  process.exit(1)
})
