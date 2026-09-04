/**
 * The project's assets — the things it works WITH, as opposed to the artifact
 * it works ON.
 *
 * A session accumulates material: the video the user dropped, a logo the
 * recon step harvested, stills pulled from a render, clips `video_generate`
 * invented, a font or a photo the user adds halfway through. Before this,
 * that material existed only as paths in the agent's head — the user could
 * see the artifact but not the ingredients, and "use the second logo" was not
 * a sentence anyone could say.
 *
 * An asset is addressed by its WORKSPACE-RELATIVE PATH, which is exactly what
 * every tool takes. So pointing at one in the UI and handing the agent
 * `uploads/logo.png` is the same act, and no lookup table sits in between.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createLogger } from '@saas/shared'
import { download } from '../flows/recording-edit/index.js'
import type { UploadRef } from '../flows/types.js'
import { fileUrl, type Workspace } from '../studio/paths.js'

const execFileP = promisify(execFile)
const logger = createLogger('studio:assets')

export type AssetKind = 'image' | 'video' | 'audio' | 'pdf' | 'other'
export type AssetOrigin = 'upload' | 'generated' | 'harvested'

export interface Asset {
  /** Workspace-relative — hand this straight to a tool. */
  path: string
  name: string
  kind: AssetKind
  origin: AssetOrigin
  size: number
  mtime: string
  /** Where the browser can fetch the file itself, to open or play it. */
  url: string
  /** A picture OF the file — a video frame, a PDF's first page. Null for audio. */
  thumbUrl: string | null
  /** Pages, for a PDF the user can point at. Zero when it is not a PDF. */
  pages?: number
}

const KINDS: Array<[RegExp, AssetKind]> = [
  [/\.(png|jpe?g|webp|gif|avif|svg|bmp)$/i, 'image'],
  [/\.(mp4|webm|mov|mkv|avi)$/i, 'video'],
  [/\.(mp3|wav|m4a|aac|ogg|flac)$/i, 'audio'],
  [/\.pdf$/i, 'pdf'],
]

export function kindOf(file: string): AssetKind | null {
  for (const [re, kind] of KINDS) if (re.test(file)) return kind
  return null
}

/**
 * Where material lives, and what it means when it is there. Ordered: the
 * first match wins, so `build/input-images` reads as harvested rather than
 * inheriting `build`.
 *
 * Deliberately NOT scanned: `vendor/` (the GSAP runtime), `build/qa-renders/`
 * (screenshots the deck QA takes and throws away), and anything at depth — an
 * asset shelf that lists five hundred engine files is not a shelf.
 */
const SOURCES: Array<{ dir: string; origin: AssetOrigin; depth: number }> = [
  { dir: 'uploads', origin: 'upload', depth: 1 },
  { dir: 'input', origin: 'upload', depth: 1 },
  { dir: 'renders', origin: 'generated', depth: 1 },
  { dir: 'audio', origin: 'generated', depth: 1 },
  { dir: 'recon', origin: 'harvested', depth: 2 },
  { dir: 'build/images', origin: 'harvested', depth: 2 },
  { dir: 'build/input-images', origin: 'harvested', depth: 1 },
]

/** Intermediates a pipeline writes for itself; not material anyone points at. */
const IGNORED = /(^|\/)(__|\.)|(^|\/)qa-renders\//

/**
 * Whether a workspace path would land on the shelf — derived from the same
 * SOURCES and KINDS above so the watcher and the listing cannot drift apart.
 *
 * The watcher needs this because a harvested logo or a scraped deck image is
 * material the user can point at, but changes nothing about what the preview
 * shows. Without it the shelf only refreshed when a RENDER happened to change
 * at the same time.
 */
export const ASSET_PATH = new RegExp(
  `^(?:${SOURCES.map(s => s.dir.replace(/\//g, '\\/')).join('|')})\\/.+\\.(?:${KINDS.map(([re]) =>
    re.source.replace(/^\\\.|\$$/g, '').replace(/^\(|\)$/g, ''),
  ).join('|')})$`,
  'i',
)

const MAX_ASSETS = 200

async function walk(root: string, rel: string, depth: number, out: string[]): Promise<void> {
  if (out.length >= MAX_ASSETS) return
  const entries = await readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name
    if (IGNORED.test(child)) continue
    if (entry.isDirectory()) {
      if (depth > 1) await walk(root, child, depth - 1, out)
    } else if (kindOf(entry.name)) {
      out.push(child)
      if (out.length >= MAX_ASSETS) return
    }
  }
}

/** Everything in the workspace the user could reasonably point at, newest first. */
export async function listAssets(ws: Workspace, projectId: string): Promise<Asset[]> {
  if (!existsSync(ws.dir)) return []
  const found: Asset[] = []
  const seen = new Set<string>()

  for (const source of SOURCES) {
    if (!existsSync(path.join(ws.dir, source.dir))) continue
    const rels: string[] = []
    await walk(ws.dir, source.dir, source.depth, rels)
    for (const rel of rels) {
      if (seen.has(rel)) continue
      seen.add(rel)
      const kind = kindOf(rel)
      if (!kind) continue
      try {
        const info = await stat(path.join(ws.dir, rel))
        found.push({
          path: rel,
          name: path.basename(rel),
          kind,
          origin: source.origin,
          size: info.size,
          mtime: info.mtime.toISOString(),
          url: fileUrl(ws.internal, rel),
          thumbUrl:
            kind === 'audio' || kind === 'other'
              ? null
              : `/projects/${encodeURIComponent(projectId)}/assets/thumb?path=${encodeURIComponent(rel)}`,
          // The page picker needs the count up front. One `pdfinfo` per PDF,
          // and a workspace rarely holds more than a couple.
          ...(kind === 'pdf' ? { pages: await pdfPageCount(ws, rel) } : {}),
        })
      } catch {
        /* it went away between the listing and the stat */
      }
    }
  }

  // `recording/upload.<ext>` is deliberately not a source: it is the editor's
  // fixed-path copy of a file the user already sees under uploads/.
  return found.sort((a, b) => b.mtime.localeCompare(a.mtime))
}

/**
 * Add files to the project mid-session. They land in `uploads/` like anything
 * else the user attached, so the agent finds them where it already looks.
 */
export async function addAssets(
  ws: Workspace,
  projectId: string,
  uploads: UploadRef[],
): Promise<Asset[]> {
  const added: string[] = []
  for (const upload of uploads) {
    const name = path.basename(upload.name).replace(/[^\w.-]+/g, '_') || 'asset'
    if (!kindOf(name)) {
      logger.warn({ ws: ws.internal, name }, 'skipping an asset of an unsupported kind')
      continue
    }
    try {
      await download(upload.url, path.join(ws.dir, 'uploads', name))
      added.push(`uploads/${name}`)
    } catch (err) {
      logger.warn({ err, ws: ws.internal, name }, 'could not stage the asset')
    }
  }
  if (!added.length) return []
  const all = await listAssets(ws, projectId)
  return all.filter(a => added.includes(a.path))
}

/**
 * Remove one asset from the workspace.
 *
 * Only shelf material can go: the same matcher that decides what is listed
 * decides what can be deleted, so no path that reaches this can name a
 * builder script, the engine runtime, or anything outside the project.
 *
 * The user's own upload is theirs to remove, and so is a clip the agent made
 * that they did not want — a shelf you cannot tidy fills up with rejected
 * takes and stops being useful.
 */
export async function deleteAsset(ws: Workspace, rel: string): Promise<boolean> {
  if (!ASSET_PATH.test(rel)) throw new Error(`not a removable asset: "${rel}"`)
  const file = path.resolve(ws.dir, rel)
  const root = path.resolve(ws.dir)
  if (!file.startsWith(`${root}${path.sep}`))
    throw new Error(`path escapes the workspace: "${rel}"`)
  if (!existsSync(file)) return false
  await rm(file, { force: true })
  // Its thumbnails are now pictures of nothing.
  const thumbs = path.join(ws.dir, '.thumbs')
  const prefix = `asset_${rel.replace(/[^\w.-]+/g, '_').slice(0, 120)}`
  for (const f of await readdir(thumbs).catch(() => [] as string[]))
    if (f.startsWith(prefix.slice(0, 40))) await rm(path.join(thumbs, f), { force: true })
  logger.info({ ws: ws.internal, rel }, 'asset deleted')
  return true
}

// ── Thumbnails ───────────────────────────────────────────────────────────────

/**
 * A picture of an asset, so the shelf shows what a file IS rather than a glyph
 * standing in for its type. Three files called `gen-01.mp4` are indis-
 * tinguishable; three frames from them are not.
 *
 * Cached next to the project under `.thumbs/`, keyed by path and time and
 * invalidated by the source's mtime — a clip the agent regenerates under the
 * same name must not keep showing the old frame.
 */
const THUMB_WIDTH = 320

/**
 * ffmpeg cannot open a PDF; poppler can, and it ships in Dockerfile.base.
 *
 * pdftoppm takes an output PREFIX, not a path, and appends the extension —
 * and although it documents `-` for stdout, poppler 26 exits 0 having written
 * nothing that way. So it writes a real file and we read it back.
 */
async function pdfThumbnail(file: string, page: number): Promise<Buffer | null> {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-pdfthumb-'))
  const prefix = path.join(dir, 'page')
  try {
    await execFileP('pdftoppm', [
      '-jpeg',
      '-f',
      String(page),
      '-l',
      String(page),
      '-singlefile',
      '-scale-to',
      String(THUMB_WIDTH),
      file,
      prefix,
    ])
    return await readFile(`${prefix}.jpg`)
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function frameThumbnail(file: string, atSec: number): Promise<Buffer | null> {
  const { stdout } = await execFileP(
    'ffmpeg',
    // -ss before -i seeks by keyframe: fast, and a thumbnail does not need
    // frame accuracy. `thumbnail` picks the most representative frame of the
    // window rather than whatever black frame a cut happens to land on.
    [
      '-ss',
      String(atSec),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `thumbnail,scale=${THUMB_WIDTH}:-2`,
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-q:v',
      '6',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 } as any,
  )
  const buf = Buffer.from(stdout as any)
  return buf.length ? buf : null
}

export interface ThumbRequest {
  /** Workspace-relative path of the asset. */
  path: string
  /** Seconds into a video, or the 1-based page of a PDF. */
  at?: number
}

/**
 * What may be pictured, which is slightly more than what the shelf lists: a
 * deck's own `build/output.pdf` is previewed and page-selected without being
 * material anyone would point at, so it needs thumbnails without becoming an
 * asset. Deletion deliberately does NOT use this — the shelf may only remove
 * what the shelf shows.
 */
const THUMBABLE = new RegExp(`(?:${ASSET_PATH.source})|^build\\/output\\.pdf$`, 'i')

export async function assetThumbnail(ws: Workspace, req: ThumbRequest): Promise<Buffer | null> {
  const rel = req.path
  if (!THUMBABLE.test(rel)) return null
  const file = path.join(ws.dir, rel)
  const root = path.resolve(ws.dir)
  if (!path.resolve(file).startsWith(`${root}${path.sep}`)) return null
  if (!existsSync(file)) return null

  const kind = kindOf(rel)
  if (kind === 'audio' || kind === 'other' || kind === null) return null

  const at = Number.isFinite(req.at) ? Math.max(0, Number(req.at)) : null
  const key = `${rel}@${at ?? 'auto'}`.replace(/[^\w.-]+/g, '_').slice(0, 120)
  const cacheFile = path.join(ws.dir, '.thumbs', `asset_${key}.jpg`)

  try {
    const [cached, source] = await Promise.all([stat(cacheFile), stat(file)])
    if (cached.mtimeMs >= source.mtimeMs) return await readFile(cacheFile)
  } catch {
    // no usable cache — render it
  }

  let buf: Buffer | null = null
  try {
    if (kind === 'pdf') buf = await pdfThumbnail(file, Math.max(1, Math.round(at ?? 1)))
    // A poster frame at 0s is often black; a moment in is more use. ffmpeg
    // reads stills too, so images take the same path and come back scaled.
    else buf = await frameThumbnail(file, kind === 'video' ? (at ?? 1) : 0)
  } catch (err) {
    logger.warn({ err, ws: ws.internal, rel }, 'could not make an asset thumbnail')
    return null
  }

  if (buf)
    void mkdir(path.dirname(cacheFile), { recursive: true })
      .then(() => writeFile(cacheFile, buf as Buffer))
      .catch(() => {})
  return buf
}

/** How many pages a PDF has, for the page picker. Zero when poppler cannot say. */
export async function pdfPageCount(ws: Workspace, rel: string): Promise<number> {
  if (kindOf(rel) !== 'pdf') return 0
  const file = path.join(ws.dir, rel)
  if (!existsSync(file)) return 0
  try {
    const { stdout } = await execFileP('pdfinfo', [file], { encoding: 'utf8', maxBuffer: 1 << 20 })
    return Number(String(stdout).match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)
  } catch {
    return 0
  }
}
