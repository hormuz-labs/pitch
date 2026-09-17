/**
 * Recording edit: the user uploads a narrated screen recording; the agent
 * reconstructs camera events (recording/demo-state.json) from the footage with
 * the recording_* tools and renders the edited video through edit_render. The
 * user iterates by chat; the studio previews the newest render.
 *
 * Workspace layout
 *   recording/upload.<ext>        the uploaded recording
 *   recording/demo-state.json     zoom + click events (written by the record_* tools)
 *   recording/{transcript,key-moments}.json, vision-log.jsonl, frames/   evidence
 *   renders/edit-<stamp>.mp4      renders (newest is the preview)
 *   project.json                  { userId, options, uploads }
 */
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as db from '@saas/db'
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email'
import { createLogger, sendDiscordMessage } from '@saas/shared'
import * as storage from '@saas/storage'
import { addOutput } from '../../projects/service.js'
import { type RecordingEditState, renderRecordingEdit } from '../../render/recording-edit.js'
import { writeTimeline } from '../../render/utils/beats.js'
import { registerHostAction } from '../../studio/host-actions.js'
import { fileUrl, type Workspace } from '../../studio/paths.js'
import type { Output, UploadRef } from '../types.js'

const logger = createLogger('studio:recording-edit')

const EDIT_CREDIT_COST = 2
const RECORDING_DIR = 'recording'
const RENDERS_DIR = 'renders'
const RELEVANT = /^(recording\/demo-state\.json|renders\/.+)$/

// ── workspace helpers ─────────────────────────────────────────────────────────

/** Extension of an uploaded file name, `.mp4` when it has none. */
export function extOf(name: string | undefined): string {
  const ext = path.extname(name ?? '').toLowerCase()
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.mp4'
}

/** The uploaded recording (recording/upload.<ext>), workspace-relative, or null. */
async function findUpload(dir: string): Promise<string | null> {
  const files = await readdir(path.join(dir, RECORDING_DIR)).catch(() => [] as string[])
  const hit = files.find(f => /^upload\.[a-z0-9]+$/i.test(f))
  return hit ? `${RECORDING_DIR}/${hit}` : null
}

/** Finished renders (renders/*.mp4 minus intermediates), newest first. */
async function listRenders(
  dir: string,
): Promise<Array<{ rel: string; mtime: Date; bytes: number }>> {
  const rendersDir = path.join(dir, RENDERS_DIR)
  const files = await readdir(rendersDir).catch(() => [] as string[])
  const out: Array<{ rel: string; mtime: Date; bytes: number }> = []
  for (const f of files) {
    if (!/\.mp4$/i.test(f) || f === 'raw.mp4' || f.startsWith('__')) continue
    const st = await stat(path.join(rendersDir, f)).catch(() => null)
    if (st) out.push({ rel: `${RENDERS_DIR}/${f}`, mtime: st.mtime, bytes: st.size })
  }
  return out.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

type DemoState = RecordingEditState

async function readState(dir: string): Promise<DemoState | null> {
  try {
    return JSON.parse(
      await readFile(path.join(dir, RECORDING_DIR, 'demo-state.json'), 'utf8'),
    ) as DemoState
  } catch {
    return null
  }
}

/**
 * Narration spans from recording/transcript.json (whisper), on the upload's own
 * timeline. These become the studio's scene strip once the render maps them
 * onto the finished cut — without a transcript the strip stays empty.
 */
async function readNarration(
  dir: string,
): Promise<Array<{ start: number; dur: number; text?: string }>> {
  try {
    const raw = await readFile(path.join(dir, RECORDING_DIR, 'transcript.json'), 'utf8')
    const segments = (JSON.parse(raw)?.segments ?? []) as Array<{
      start?: number
      end?: number
      text?: string
    }>
    return segments
      .filter(seg => typeof seg.start === 'number')
      .map(seg => ({
        start: seg.start as number,
        dur: Math.max(0, (seg.end ?? seg.start ?? 0) - (seg.start as number)),
        text: typeof seg.text === 'string' ? seg.text.trim() : undefined,
      }))
  } catch {
    return []
  }
}

function eventCounts(state: DemoState | null): {
  zoomIn: number
  zoomOut: number
  clicks: number
  total: number
} {
  const zooms = Array.isArray(state?.zoomEvents) ? state.zoomEvents : []
  const clicks = Array.isArray(state?.clickEvents) ? state.clickEvents : []
  const zoomIn = zooms.filter(z => z.type === 'in').length
  const zoomOut = zooms.filter(z => z.type === 'out').length
  return { zoomIn, zoomOut, clicks: clicks.length, total: zooms.length + clicks.length }
}

async function readProjectJson(
  dir: string,
): Promise<{ userId?: string; options?: Record<string, any>; uploads?: UploadRef[] } | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, 'project.json'), 'utf8'))
  } catch {
    return null
  }
}

export async function download(url: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest))
}

/** The first-turn brief — the old worker's buildEditPrompt, with edit_render as the last step. */
function buildEditPrompt(params: {
  videoFile: string
  productName?: string
  productUrl?: string
  instructions?: string
}): string {
  return [
    'Edit the uploaded screen recording into a cinematic product demo.',
    '',
    `Video file: \`${params.videoFile}\` (relative to the working directory)`,
    params.productName ? `Product name: "${params.productName}"` : null,
    params.productUrl ? `Product URL: ${params.productUrl}` : null,
    params.instructions ? `User instructions: "${params.instructions}"` : null,
    '',
    'Run your standard workflow end to end:',
    '1. probe_video, then transcribe_video (narration is your primary prior) and detect_key_moments (visual prior).',
    '2. Correlate narration with the footage into padded action windows.',
    '3. inspect_frames each window to verify the action, its on-screen region, and its exact time.',
    '4. Emit the camera plan with record_zoom_in / record_zoom_out / record_click into recording/demo-state.json.',
    '5. edit_render — render and publish the edited video, then reply with the event summary and the video URL.',
    '',
    'The user wants results, not questions: do not interview them or wait for confirmations.',
  ]
    .filter(l => l !== null)
    .join('\n')
}

export function optionStr(options: Record<string, any>, key: string): string | undefined {
  const v = options[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

// ── the flow ──────────────────────────────────────────────────────────────────

// ── host action: edit_render ──────────────────────────────────────────────────

async function projectRowFor(ws: Workspace) {
  return db.prisma.project.findFirst({
    where: { userId: ws.userId, name: ws.name },
  })
}

registerHostAction(
  'edit_render',
  async (ws, params) => {
    const state = await readState(ws.dir)
    if (!state)
      throw new Error(
        'recording/demo-state.json not found — run probe_video and record the events first',
      )
    const upload = await findUpload(ws.dir)
    if (!upload) throw new Error('no uploaded recording found under recording/')

    const project = await readProjectJson(ws.dir)
    const options = {
      productName:
        optionStr(params, 'productName') ?? optionStr(project?.options ?? {}, 'productName'),
      productUrl:
        optionStr(params, 'productUrl') ?? optionStr(project?.options ?? {}, 'productUrl'),
      fps: params.fps ?? project?.options?.fps,
    }
    const counts = eventCounts(state)
    const log = logger.child({ workspace: ws.internal })
    log.info({ ...counts, upload }, 'edit_render start')

    const outDir = path.join(ws.dir, RENDERS_DIR)
    const result = await renderRecordingEdit(
      {
        workspaceDir: ws.dir,
        uploadPath: path.join(ws.dir, upload),
        state,
        options,
        outDir,
        narration: await readNarration(ws.dir),
      },
      log,
    )
    await rm(result.rawPath, { force: true })
    await writeTimeline(result.finalPath, {
      durationSec: result.durationSec,
      beats: result.beats,
    }).catch(err => log.warn({ err }, 'could not write the render timeline'))
    const rel = `${RENDERS_DIR}/${path.basename(result.finalPath)}`
    const createdAt = new Date().toISOString()

    const row = await projectRowFor(ws)
    const firstRender =
      !row || !(JSON.parse(String(row.outputs || '[]')) as Output[]).some(o => o.kind === 'video')

    let url = fileUrl(ws.internal, rel)
    let published = false
    try {
      url = await storage.uploadFile(
        result.finalPath,
        undefined,
        `pitch/${ws.userId}/${ws.name}/videos`,
      )
      published = true
    } catch (err) {
      log.warn({ err }, 'render upload failed — serving the local file')
    }
    if (row)
      await addOutput(ws.userId, row.id, {
        kind: 'video',
        url,
        label: 'Edited recording',
        createdAt,
      })
    else log.warn('no project row for workspace — output not recorded')

    // Notify once, when the first render lands (iterations are watched live in the studio).
    if (published && firstRender && row) {
      const videoTitle = options.productName || (project?.uploads?.[0]?.name ?? ws.name)
      void (async () => {
        const email = await getClerkUserEmail(ws.userId)
        if (email)
          await sendJobCompleteEmail({ to: email, jobId: row.id, videoUrl: url, videoTitle })
        await sendDiscordMessage(
          `✅ **Recording Edit Completed**\nProject: \`${row.id}\`\nUser: ${email ?? ws.userId}\nTitle: ${row.title}\nOutput Video: ${url}`,
        )
      })().catch(err => log.warn({ err }, 'completion notification failed'))
    }

    log.info({ url, durationSec: result.durationSec }, 'edit_render done')
    return (
      `Rendered ${rel} (${result.durationSec.toFixed(1)}s, ${counts.zoomIn} zoom-ins, ${counts.zoomOut} zoom-outs, ${counts.clicks} clicks). ` +
      (published ? `Published video URL: ${url}` : `Upload failed; local video URL: ${url}`)
    )
  },
  { remote: true },
)
