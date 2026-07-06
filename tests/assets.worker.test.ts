/**
 * Tests for the worker asset pipeline (apps/worker/src/utils/assets.ts).
 *
 * Uses REAL poppler (pdftoppm/pdftotext/pdfinfo) and ffprobe against tiny
 * generated fixtures, served over a local HTTP server so the download path
 * is exercised for real. No mocks.
 */

import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AssetManifest,
  formatAssetManifestForPrompt,
  prepareAssets,
} from '../apps/worker/src/utils/assets.js'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Minimal valid one-page PDF containing the text "Hello Pitch". */
function buildMinimalPdf(): Buffer {
  const stream = 'BT /F1 18 Tf 20 100 Td (Hello Pitch) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

let server: http.Server
let baseUrl: string
let workDir: string

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-test-'))

  server = http.createServer((req, res) => {
    if (req.url === '/photo.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(PNG_1x1)
    } else if (req.url === '/deck.pdf') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' })
      res.end(buildMinimalPdf())
    } else {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(workDir, { recursive: true, force: true })
})

describe('prepareAssets', () => {
  it('downloads an image, probes its dimensions, and writes the manifest', async () => {
    const baseDir = path.join(workDir, 'job-image')
    const manifest = await prepareAssets(
      'job-image',
      [{ url: `${baseUrl}/photo.png`, name: 'photo.png', type: 'image/png', size: PNG_1x1.length }],
      baseDir,
    )

    expect(manifest.assets).toHaveLength(1)
    const asset = manifest.assets[0]
    expect(asset.kind).toBe('image')
    if (asset.kind !== 'image') throw new Error('expected image asset')
    expect(asset.width).toBe(1)
    expect(asset.height).toBe(1)
    expect(fs.existsSync(asset.localPath)).toBe(true)
    // regions is always present (empty when tesseract is unavailable / no text).
    expect(Array.isArray(asset.regions)).toBe(true)

    // assets.json manifest is written alongside the assets
    const onDisk = JSON.parse(fs.readFileSync(path.join(baseDir, 'assets.json'), 'utf-8'))
    expect(onDisk.jobId).toBe('job-image')
    expect(onDisk.assets).toHaveLength(1)
  })

  it('converts a PDF to page images and extracts its text', async () => {
    const baseDir = path.join(workDir, 'job-pdf')
    const manifest = await prepareAssets(
      'job-pdf',
      [{ url: `${baseUrl}/deck.pdf`, name: 'deck.pdf', type: 'application/pdf', size: 1 }],
      baseDir,
    )

    expect(manifest.assets).toHaveLength(1)
    const asset = manifest.assets[0]
    expect(asset.kind).toBe('pdf')
    if (asset.kind !== 'pdf') throw new Error('expected pdf asset')
    expect(asset.pageCount).toBe(1)
    expect(asset.pages).toHaveLength(1)
    expect(asset.pages[0]).toMatch(/page-0*1\.png$/)
    expect(fs.existsSync(asset.pages[0])).toBe(true)
    expect(asset.text).toContain('Hello Pitch')
  })

  it('extracts targetable regions from the PDF (pdftotext -bbox)', async () => {
    const baseDir = path.join(workDir, 'job-pdf-regions')
    const manifest = await prepareAssets(
      'job-pdf-regions',
      [{ url: `${baseUrl}/deck.pdf`, name: 'deck.pdf', type: 'application/pdf', size: 1 }],
      baseDir,
    )
    const asset = manifest.assets[0]
    if (asset.kind !== 'pdf') throw new Error('expected pdf asset')

    expect(asset.pageData).toHaveLength(1)
    const page = asset.pageData[0]
    // pageData is parallel to pages.
    expect(page.image).toBe(asset.pages[0])
    // The fixture line "Hello Pitch" becomes one phrase region, in-bounds.
    expect(page.regions.length).toBeGreaterThanOrEqual(1)
    const joined = page.regions.map(r => r.text).join(' ')
    expect(joined).toContain('Hello')
    for (const r of page.regions) {
      for (const v of [r.leftPct, r.topPct, r.widthPct, r.heightPct]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('sanitizes hostile filenames so files stay inside the assets dir', async () => {
    const baseDir = path.join(workDir, 'job-hostile')
    const manifest = await prepareAssets(
      'job-hostile',
      [
        {
          url: `${baseUrl}/photo.png`,
          name: '../../../etc/passwd owned.png',
          type: 'image/png',
          size: PNG_1x1.length,
        },
      ],
      baseDir,
    )

    expect(manifest.assets).toHaveLength(1)
    const localPath = manifest.assets[0].localPath
    expect(path.resolve(localPath).startsWith(path.resolve(baseDir) + path.sep)).toBe(true)
    expect(fs.existsSync(localPath)).toBe(true)
  })

  it('skips assets that fail to download but still writes the manifest', async () => {
    const baseDir = path.join(workDir, 'job-404')
    const manifest = await prepareAssets(
      'job-404',
      [
        { url: `${baseUrl}/missing.png`, name: 'missing.png', type: 'image/png', size: 1 },
        { url: `${baseUrl}/photo.png`, name: 'photo.png', type: 'image/png', size: PNG_1x1.length },
      ],
      baseDir,
    )

    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0].name).toBe('photo.png')
    expect(fs.existsSync(path.join(baseDir, 'assets.json'))).toBe(true)
  })

  it('skips unsupported asset types', async () => {
    const baseDir = path.join(workDir, 'job-unsupported')
    const manifest = await prepareAssets(
      'job-unsupported',
      [{ url: `${baseUrl}/photo.png`, name: 'a.bin', type: 'application/octet-stream', size: 1 }],
      baseDir,
    )
    expect(manifest.assets).toHaveLength(0)
  })
})

describe('formatAssetManifestForPrompt', () => {
  it('renders PDFs with page list and text preview, images with dimensions', () => {
    const manifest: AssetManifest = {
      jobId: 'j1',
      baseDir: '/tmp/assets/j1',
      assets: [
        {
          kind: 'pdf',
          name: 'deck.pdf',
          originalUrl: 'http://x/deck.pdf',
          localPath: '/tmp/assets/j1/deck.pdf',
          pageCount: 2,
          pages: [
            '/tmp/assets/j1/deck.pdf.pages/page-1.png',
            '/tmp/assets/j1/deck.pdf.pages/page-2.png',
          ],
          pageData: [
            {
              image: '/tmp/assets/j1/deck.pdf.pages/page-1.png',
              regions: [
                {
                  id: 'p0r0',
                  text: 'line one',
                  leftPct: 10,
                  topPct: 10,
                  widthPct: 20,
                  heightPct: 3,
                },
              ],
            },
            { image: '/tmp/assets/j1/deck.pdf.pages/page-2.png', regions: [] },
          ],
          text: 'line one\nline two',
        },
        {
          kind: 'image',
          name: 'shot.png',
          originalUrl: 'http://x/shot.png',
          localPath: '/tmp/assets/j1/shot.png',
          width: 1920,
          height: 1080,
          regions: [],
        },
      ],
    }

    const out = formatAssetManifestForPrompt(manifest)
    expect(out).toContain('PDF: "deck.pdf" (2 pages, 1 targetable regions)')
    expect(out).toContain('page-1.png')
    expect(out).toContain('line one line two') // newlines flattened
    expect(out).toContain('Image: "shot.png" (1920x1080')
  })
})
