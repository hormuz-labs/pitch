/**
 * What is in this workspace, and what should the studio show?
 *
 * There used to be one describe() per flow, each certain of what its project
 * was. A project is not a category, so this looks instead: it finds the
 * artifacts on disk and previews the one the agent touched most recently.
 * Ask for a deck and get a deck; ask that deck to become a video and the
 * preview follows, with no flag anywhere saying which kind of project it is.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseSlides } from '../flows/deck/index.js'
import { describeLaunch } from '../flows/launch-video/describe.js'
import type { Description, Output } from '../flows/types.js'
import { pdfPageCount } from '../projects/assets.js'
import { readTimeline, scenesFromTimeline } from '../render/utils/beats.js'
import { fileUrl, type Workspace } from '../studio/paths.js'

/** Media the studio can preview, newest first. */
const VIDEO_RE = /\.(mp4|webm|mov|mkv)$/i
const PDF_RE = /\.pdf$/i
const INTERMEDIATE_RE = /^(raw\.|__)/

interface Found {
  rel: string
  mtimeMs: number
}

async function newest(dir: string, sub: string, match: RegExp): Promise<Found[]> {
  const abs = path.join(dir, sub)
  const names = await readdir(abs).catch(() => [] as string[])
  const hits: Found[] = []
  for (const name of names) {
    if (!match.test(name) || INTERMEDIATE_RE.test(name)) continue
    const st = await stat(path.join(abs, name)).catch(() => null)
    if (st?.isFile()) hits.push({ rel: sub ? `${sub}/${name}` : name, mtimeMs: st.mtimeMs })
  }
  return hits.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function mtimeOf(dir: string, rel: string): Promise<number | null> {
  const st = await stat(path.join(dir, rel)).catch(() => null)
  return st?.isFile() ? st.mtimeMs : null
}

/** A recording in progress: the user watches the browser, not a file. */
async function liveBrowser(ws: Workspace): Promise<string | null> {
  try {
    const live = JSON.parse(await readFile(path.join(ws.dir, 'recording', 'live.json'), 'utf8'))
    return typeof live?.streamId === 'string' ? live.streamId : null
  } catch {
    return null
  }
}

async function videoDescription(ws: Workspace, rel: string): Promise<Description> {
  const timeline = await readTimeline(path.join(ws.dir, rel))
  const renders = await newest(ws.dir, 'renders', VIDEO_RE)
  const outputs: Output[] = await Promise.all(
    renders.map(async r => ({
      kind: 'video' as const,
      url: fileUrl(ws.internal, r.rel),
      createdAt: new Date(r.mtimeMs).toISOString(),
    })),
  )
  return {
    preview: { kind: 'video', url: fileUrl(ws.internal, rel) },
    scenes: scenesFromTimeline(timeline),
    duration: timeline?.durationSec,
    outputs,
  }
}

async function deckDescription(ws: Workspace): Promise<Description> {
  const html = await readFile(path.join(ws.dir, 'deck.html'), 'utf8').catch(() => '')
  const outputs: Output[] = []
  const pdfMtime = await mtimeOf(ws.dir, 'build/output.pdf')
  if (pdfMtime)
    outputs.push({
      kind: 'pdf',
      url: fileUrl(ws.internal, 'build/output.pdf'),
      label: 'Deck (PDF)',
      createdAt: new Date(pdfMtime).toISOString(),
    })
  const slides = parseSlides(html)
  return {
    preview: { kind: 'deck', url: fileUrl(ws.internal, 'deck.html') },
    slides,
    outputs,
    error: slides.length === 0 ? 'deck.html has no .slide pages yet' : null,
  }
}

/**
 * The candidates, each with the time it last changed. The most recent one is
 * what the user is working on, so that is what the preview shows.
 */
async function candidates(
  ws: Workspace,
): Promise<Array<{ kind: string; rel: string; at: number }>> {
  const out: Array<{ kind: string; rel: string; at: number }> = []

  // shots.js sits at the workspace ROOT — it is what index.html loads
  // (<script src="shots.js">), what describeLaunch reads, and what the skill
  // tells the agent to write. Looking for it under js/ found nothing in any
  // project ever created, so every finished launch film reported no preview,
  // hasResult() said false, and the project was marked "finished without
  // producing anything" and refunded while the film sat there complete.
  // js/ stays as a fallback for anything that predates the convention.
  const shots = (await mtimeOf(ws.dir, 'shots.js')) ?? (await mtimeOf(ws.dir, 'js/shots.js'))
  const index = await mtimeOf(ws.dir, 'index.html')
  if (shots && index) out.push({ kind: 'launch', rel: 'index.html', at: Math.max(shots, index) })

  const deck = await mtimeOf(ws.dir, 'deck.html')
  if (deck) out.push({ kind: 'deck', rel: 'deck.html', at: deck })

  const renders = await newest(ws.dir, 'renders', VIDEO_RE)
  if (renders[0]) out.push({ kind: 'video', rel: renders[0].rel, at: renders[0].mtimeMs })

  // The uploaded source, so a project that is only an upload still previews —
  // which is what makes "here is a video, turn the music down" work at all.
  const uploaded = await newest(ws.dir, 'recording', VIDEO_RE)
  if (uploaded[0]) out.push({ kind: 'video', rel: uploaded[0].rel, at: uploaded[0].mtimeMs })

  const loose = await newest(ws.dir, '', VIDEO_RE)
  if (loose[0]) out.push({ kind: 'video', rel: loose[0].rel, at: loose[0].mtimeMs })

  // A PDF the user dropped in, so it is on screen while they decide what to
  // do with it rather than sitting behind an empty stage.
  const pdf = await mtimeOf(ws.dir, 'build/output.pdf')
  if (pdf) out.push({ kind: 'pdf', rel: 'build/output.pdf', at: pdf })
  const uploadedPdf = (await newest(ws.dir, 'uploads', PDF_RE))[0]
  if (uploadedPdf) out.push({ kind: 'pdf', rel: uploadedPdf.rel, at: uploadedPdf.mtimeMs })

  return derivedLast(out).sort((a, b) => b.at - a.at)
}

/**
 * An export never displaces the thing it was exported from.
 *
 * Rendering a launch film writes renders/launch-720p.mp4, which is then the
 * newest file in the workspace — so the preview flipped from the shots.js
 * editor to a plain video player the moment the user pressed Export, and the
 * film could no longer be edited. The same for a deck: pitch deck publish renders a
 * fresh build/output.pdf, newer than deck.html. Those files are OUTPUTS of the
 * artifact (the launch describer lists them; deckDescription lists the PDF),
 * not artifacts of their own, so while the source exists they are dropped
 * here. A workspace with only a video or only a PDF still previews it.
 */
function derivedLast(
  found: Array<{ kind: string; rel: string; at: number }>,
): Array<{ kind: string; rel: string; at: number }> {
  const hasLaunch = found.some(c => c.kind === 'launch')
  const hasDeck = found.some(c => c.kind === 'deck')
  return found.filter(c => {
    if (hasLaunch && c.kind === 'video' && c.rel.startsWith('renders/')) return false
    if (hasDeck && c.kind === 'pdf' && c.rel === 'build/output.pdf') return false
    return true
  })
}

/**
 * What the user is working on, by the most recently touched artifact —
 * 'launch' | 'deck' | 'video' | 'pdf' — or null for an empty workspace. The
 * exporter is chosen by this, never by the project's flow column: every new
 * project is flow "studio", and a studio project holding a launch film is a
 * launch film.
 */
export async function artifactKind(ws: Workspace): Promise<string | null> {
  if (!existsSync(ws.dir)) return null
  return (await candidates(ws))[0]?.kind ?? null
}

/** The source artifact currently selected by directory truth. */
export async function activeArtifact(
  ws: Workspace,
): Promise<{ kind: string; rel: string; at: number } | null> {
  if (!existsSync(ws.dir)) return null
  const streamId = await liveBrowser(ws)
  if (streamId) return { kind: 'browser', rel: 'recording/live.json', at: Date.now() }
  return (await candidates(ws))[0] ?? null
}

/**
 * Does this workspace hold anything to look at?
 *
 * The projects grid asks this for every row, so it must stay cheap — a few
 * stats, and none of the shots evaluation a full describe() would do. Without
 * it a project opened from a drop reads as an empty draft, because it has a
 * preview but has not published an output yet.
 */
export async function hasArtifact(ws: Workspace): Promise<boolean> {
  if (!existsSync(ws.dir)) return false
  if (await liveBrowser(ws)) return true
  return (await candidates(ws)).length > 0
}

export async function describeWorkspace(ws: Workspace): Promise<Description> {
  if (!existsSync(ws.dir)) return { preview: null, outputs: [] }

  const streamId = await liveBrowser(ws)
  if (streamId) return { preview: { kind: 'browser', streamId }, outputs: [] }

  const [best] = await candidates(ws)
  if (!best) return { preview: null, outputs: [] }

  // Launch films keep their own describer: shots.js carries the scene list,
  // the audio track and the per-resolution renders, none of which can be read
  // off the filesystem.
  if (best.kind === 'launch') return describeLaunch(ws)
  if (best.kind === 'deck') return deckDescription(ws)
  if (best.kind === 'pdf')
    return {
      // `path` and `pages` are what the page picker needs. They come from the
      // description rather than the asset shelf because a deck's own
      // build/output.pdf is previewable without being shelf material.
      preview: {
        kind: 'pdf',
        url: fileUrl(ws.internal, best.rel),
        path: best.rel,
        pages: await pdfPageCount(ws, best.rel),
      },
      outputs: [
        {
          kind: 'pdf',
          url: fileUrl(ws.internal, best.rel),
          label: 'PDF',
          createdAt: new Date(best.at).toISOString(),
        },
      ],
    }
  return videoDescription(ws, best.rel)
}

/** Workspace-relative paths whose change means "the preview changed". */
export const RELEVANT =
  /^(index\.html|deck\.html|js\/shots(\.custom)?\.js|audio\/mix\.wav|recording\/(live|demo-state|demo-config)\.json|recording\/upload\.[a-z0-9]+|renders\/.+|build\/output\.(html|pdf)|storyboard\.json|uploads\/[^/]+\.pdf|[^/]+\.(mp4|webm|mov|mkv))$/
