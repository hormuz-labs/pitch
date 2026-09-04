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
    return typeof live?.profileId === 'string' ? live.profileId : null
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
  for (const [rel, kind, label] of [
    ['build/output.pdf', 'pdf', 'Deck (PDF)'],
    ['deck.html', 'html', 'Deck (HTML)'],
  ] as const) {
    const mtime = await mtimeOf(ws.dir, rel)
    if (mtime)
      outputs.push({
        kind,
        url: fileUrl(ws.internal, rel),
        label,
        createdAt: new Date(mtime).toISOString(),
      })
  }
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

  const shots = await mtimeOf(ws.dir, 'js/shots.js')
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

  return out.sort((a, b) => b.at - a.at)
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

  const profileId = await liveBrowser(ws)
  if (profileId) return { preview: { kind: 'browser', profileId }, outputs: [] }

  const [best] = await candidates(ws)
  if (!best) return { preview: null, outputs: [] }

  // Launch films keep their own describer: shots.js carries the scene list,
  // the audio track and the per-resolution renders, none of which can be read
  // off the filesystem.
  if (best.kind === 'launch') return describeLaunch(ws)
  if (best.kind === 'deck') return deckDescription(ws)
  if (best.kind === 'pdf')
    return {
      preview: { kind: 'pdf', url: fileUrl(ws.internal, best.rel) },
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
