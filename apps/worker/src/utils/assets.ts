import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { createLogger } from '@saas/shared'
import { groupWordsIntoRegions, parsePdfBbox, parseTesseractTsv, type Region } from './regions.js'

const logger = createLogger('worker:assets')
const execAsync = promisify(exec)

export interface AssetInput {
  url: string
  name: string
  type: string
  size: number
}

/** A rendered PDF page image plus the targetable regions on it. */
export interface PdfPageData {
  image: string
  regions: Region[]
}

export interface PdfAsset {
  kind: 'pdf'
  name: string
  originalUrl: string
  localPath: string
  pageCount: number
  pages: string[]
  /** Per-page image + region hotspots (parallel to `pages`). */
  pageData: PdfPageData[]
  text: string
}

export interface ImageAsset {
  kind: 'image'
  name: string
  originalUrl: string
  localPath: string
  width: number
  height: number
  /** OCR-derived targetable regions (empty if tesseract is unavailable). */
  regions: Region[]
}

export type PreparedAsset = PdfAsset | ImageAsset

export interface AssetManifest {
  jobId: string
  baseDir: string
  assets: PreparedAsset[]
}

const MAX_PDF_TEXT_BYTES = 8 * 1024

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buffer)
}

async function convertPdfToImages(pdfPath: string, outDir: string): Promise<string[]> {
  await execAsync(`pdftoppm -png -r 150 "${pdfPath}" page`, { cwd: outDir })
  const files = fs
    .readdirSync(outDir)
    .filter(f => f.startsWith('page-') && f.endsWith('.png'))
    .sort()
  return files.map(f => path.join(outDir, f))
}

async function extractPdfText(pdfPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`pdftotext "${pdfPath}" -`)
    return stdout.slice(0, MAX_PDF_TEXT_BYTES)
  } catch (err: any) {
    logger.warn({ err, pdfPath }, 'Failed to extract PDF text')
    return ''
  }
}

/**
 * Extract word-position data for every PDF page via `pdftotext -bbox`, grouped
 * into phrase-level regions. Returns one entry per page in document order.
 * Never throws — on failure returns an empty array (slideshow still works).
 */
async function extractPdfRegions(pdfPath: string): Promise<Region[][]> {
  try {
    const { stdout } = await execAsync(`pdftotext -bbox "${pdfPath}" -`, {
      maxBuffer: 32 * 1024 * 1024,
    })
    const pages = parsePdfBbox(stdout)
    return pages.map((page, i) => groupWordsIntoRegions(page, { idPrefix: `p${i}r` }))
  } catch (err: any) {
    logger.warn({ err, pdfPath }, 'Failed to extract PDF regions via pdftotext -bbox')
    return []
  }
}

/**
 * OCR an image with tesseract to get word boxes, grouped into phrase regions.
 * Returns [] if tesseract is unavailable or the image has no legible text —
 * the image still renders as a slide, just without targetable hotspots.
 */
async function extractImageRegions(
  imagePath: string,
  width: number,
  height: number,
): Promise<Region[]> {
  if (!width || !height) return []
  try {
    const { stdout } = await execAsync(`tesseract "${imagePath}" stdout tsv`, {
      maxBuffer: 32 * 1024 * 1024,
    })
    const words = parseTesseractTsv(stdout)
    return groupWordsIntoRegions({ width, height, words }, { idPrefix: 'r' })
  } catch (err: any) {
    logger.warn({ err, imagePath }, 'Failed to OCR image with tesseract (skipping hotspots)')
    return []
  }
}

async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`pdfinfo "${pdfPath}"`)
    const match = stdout.match(/Pages:\s*(\d+)/)
    if (match) return parseInt(match[1], 10)
  } catch (err: any) {
    logger.warn({ err, pdfPath }, 'Failed to get PDF page count from pdfinfo')
  }
  return 0
}

async function probeImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imagePath}"`,
    )
    const [width, height] = stdout
      .trim()
      .split('x')
      .map(s => parseInt(s, 10))
    if (width && height) return { width, height }
  } catch (err: any) {
    logger.warn({ err, imagePath }, 'Failed to probe image dimensions')
  }
  return { width: 0, height: 0 }
}

function normalizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/__+/g, '_')
}

export async function prepareAssets(
  jobId: string,
  assets: AssetInput[],
  baseDir: string,
): Promise<AssetManifest> {
  const manifest: AssetManifest = { jobId, baseDir, assets: [] }

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }

  for (const asset of assets) {
    const safeName = normalizeFilename(asset.name)
    const localPath = path.join(baseDir, safeName)

    try {
      await downloadFile(asset.url, localPath)
      logger.info({ jobId, name: asset.name, type: asset.type }, 'Downloaded asset')
    } catch (err: any) {
      logger.warn({ err, jobId, asset }, 'Failed to download asset, skipping')
      continue
    }

    if (asset.type === 'application/pdf') {
      const pageDir = path.join(baseDir, `${safeName}.pages`)
      if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true })

      const [pages, text, pageCount, regionsByPage] = await Promise.all([
        convertPdfToImages(localPath, pageDir),
        extractPdfText(localPath),
        getPdfPageCount(localPath),
        extractPdfRegions(localPath),
      ])

      const pageData: PdfPageData[] = pages.map((image, i) => ({
        image,
        regions: regionsByPage[i] ?? [],
      }))

      manifest.assets.push({
        kind: 'pdf',
        name: asset.name,
        originalUrl: asset.url,
        localPath,
        pageCount: pageCount || pages.length,
        pages,
        pageData,
        text,
      })
      logger.info(
        {
          jobId,
          name: asset.name,
          pages: pages.length,
          regions: pageData.reduce((n, p) => n + p.regions.length, 0),
        },
        'Prepared PDF asset',
      )
    } else if (asset.type.startsWith('image/')) {
      const dims = await probeImageDimensions(localPath)
      const regions = await extractImageRegions(localPath, dims.width, dims.height)
      manifest.assets.push({
        kind: 'image',
        name: asset.name,
        originalUrl: asset.url,
        localPath,
        width: dims.width,
        height: dims.height,
        regions,
      })
      logger.info(
        { jobId, name: asset.name, dims, regions: regions.length },
        'Prepared image asset',
      )
    } else {
      logger.warn({ jobId, asset }, 'Unsupported asset type, skipping')
    }
  }

  const manifestPath = path.join(baseDir, 'assets.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  logger.info({ jobId, manifestPath, count: manifest.assets.length }, 'Wrote asset manifest')

  return manifest
}

export function formatAssetManifestForPrompt(manifest: AssetManifest): string {
  const lines = manifest.assets.map(a => {
    if (a.kind === 'pdf') {
      const regionCount = a.pageData.reduce((n, p) => n + p.regions.length, 0)
      return `- PDF: "${a.name}" (${a.pageCount} pages, ${regionCount} targetable regions)\n  Pages: ${a.pages.join(', ')}\n  Text preview: ${a.text.slice(0, 500).replace(/\n/g, ' ')}`
    }
    const regionNote = a.regions.length
      ? `${a.regions.length} targetable regions`
      : 'no text regions detected'
    return `- Image: "${a.name}" (${a.width}x${a.height}, ${regionNote}) at ${a.localPath}`
  })
  return lines.join('\n')
}
