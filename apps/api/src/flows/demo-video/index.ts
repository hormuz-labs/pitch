/**
 * Demo video: the agent records a narrated product demo in the user's
 * CloakBrowser (playwright-cli through demo_* tools), renders it with the
 * ffmpeg pipeline and iterates from the chat. What the old worker did around
 * the agent (assets → browser → record → stop → render → publish → notify) is
 * now a set of host actions the demo-flow-tools extension calls, in order.
 *
 * Workspace layout
 *   project.json         { userId, options, uploads }  — what the tools read
 *   uploads/<name>       the user's PDFs/images
 *   recording/           demo-config.json, demo-state.json, demo.webm, audio/,
 *                        assets/assets.json (manifest), live.json while recording
 *   storyboard.json      draft/approved storyboard (asset projects, optional)
 *   renders/demo-*.mp4   every render, newest = the preview
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as db from '@saas/db'
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email'
import {
  approveVideoStoryboard,
  createLogger,
  sendDiscordMessage,
  updateVideoStoryboard,
  type VideoStoryboard,
} from '@saas/shared'
import * as storage from '@saas/storage'
import { addOutput } from '../../projects/service.js'
import { shouldWatermarkVideo } from '../../projects/watermark.js'
import { type DemoState, renderDemo } from '../../render/demo.js'
import { execAsync } from '../../render/media.js'
import { prepareDemoAssets, type RecordingHandle, startRecording } from '../../render/recording.js'
import { type AssetManifest, formatAssetManifestForPrompt } from '../../render/utils/assets.js'
import { writeTimeline } from '../../render/utils/beats.js'
import { buildDemoJobInput } from '../../render/utils/demo-job-input.js'
import {
  expectedSlideshowSlideCount,
  type SlideshowProgress,
  validateSlideshowCoverage,
} from '../../render/utils/slideshow-progress.js'
import {
  analyzeStoryboardPage,
  buildStoryboardDraft,
  type StoryboardPage,
} from '../../render/utils/storyboard-planner.js'
import { callHostAction, registerHostAction } from '../../studio/host-actions.js'
import { ASSETS_DIR, fileUrl, type Workspace } from '../../studio/paths.js'
import type { UploadRef } from '../types.js'

const logger = createLogger('studio:demo-video')

const RELEVANT = /^(recording\/(demo-state|demo-config|live)\.json|storyboard\.json|renders\/.+)$/

interface ProjectFile {
  userId: string
  options: Record<string, any>
  uploads: UploadRef[]
}

interface LiveFile {
  profileId: string
  session: string
  startedAt: number
}

/** Recording handles by workspace dir — demo_record_stop / demo_render find them here. */
const active = new Map<string, RecordingHandle>()
/** Workspaces whose demo_record_stop was already refused once for missing pages. */
const coverageWarned = new Set<string>()

// ── workspace files ──────────────────────────────────────────────────────────

const projectFile = (ws: Workspace) => path.join(ws.dir, 'project.json')
const recordingDir = (ws: Workspace) => path.join(ws.dir, 'recording')
const rendersDir = (ws: Workspace) => path.join(ws.dir, 'renders')
const liveFile = (ws: Workspace) => path.join(recordingDir(ws), 'live.json')
const stateFile = (ws: Workspace) => path.join(recordingDir(ws), 'demo-state.json')
const configFile = (ws: Workspace) => path.join(recordingDir(ws), 'demo-config.json')
const manifestFile = (ws: Workspace) => path.join(recordingDir(ws), 'assets', 'assets.json')
const storyboardFile = (ws: Workspace) => path.join(ws.dir, 'storyboard.json')

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readProject(ws: Workspace): Promise<ProjectFile> {
  const p = await readJson<ProjectFile>(projectFile(ws))
  return { userId: p?.userId ?? ws.userId, options: p?.options ?? {}, uploads: p?.uploads ?? [] }
}

const isAsset = (u: UploadRef) =>
  u.type === 'application/pdf' ||
  u.type.startsWith('image/') ||
  /\.(pdf|png|jpe?g|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i.test(u.name)

/** Renders newest first (raw.mp4 and __intermediates excluded). */
async function listRenders(ws: Workspace): Promise<Array<{ file: string; mtimeMs: number }>> {
  const dir = rendersDir(ws)
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter(
    f => /\.mp4$/i.test(f) && f !== 'raw.mp4' && !f.startsWith('__'),
  )
  const withTimes = await Promise.all(
    files.map(async file => ({ file, mtimeMs: (await stat(path.join(dir, file))).mtimeMs })),
  )
  return withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function hostOf(text: string | undefined | null): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/([^/\s)]+)/i) ?? text.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i)
  return m?.[1]?.replace(/^www\./i, '') ?? null
}

async function projectRow(ws: Workspace) {
  const row = await db.prisma.project.findFirst({
    where: { userId: ws.userId, name: ws.name },
  })
  if (!row) throw new Error(`No demo-video project for workspace ${ws.name}`)
  return row
}

// ── storyboard helpers ───────────────────────────────────────────────────────

/** The section the worker used to send for an approved storyboard (buildDemoJobInput). */
function storyboardContract(storyboard: VideoStoryboard, assetCount: number): string {
  const full = buildDemoJobInput({
    hasPreparedAssets: assetCount > 0,
    assetCount,
    storyboard,
  }).prompt
  const at = full.indexOf('APPROVED STORYBOARD REVISION')
  return at >= 0 ? full.slice(at) : ''
}

function storyboardSummary(sb: VideoStoryboard): string {
  const lines = sb.scenes.map((s, i) => {
    const narration = s.narration.length > 140 ? `${s.narration.slice(0, 140)}…` : s.narration
    return `[${i + 1}] page ${s.pageIndex + 1}${s.title ? ` "${s.title}"` : ''}${s.enabled ? '' : ' (disabled)'} · ${s.emphasis.length} emphasis · "${narration}"`
  })
  return `Storyboard revision ${sb.revision} (${sb.status}, transition ${sb.transition}), ${sb.scenes.length} scene(s):\n${lines.join('\n')}`
}

function pagesOf(manifest: AssetManifest): StoryboardPage[] {
  const pages: StoryboardPage[] = []
  for (const asset of manifest.assets) {
    if (asset.kind === 'pdf')
      for (const imagePath of asset.pages) pages.push({ pageIndex: pages.length, imagePath })
    else pages.push({ pageIndex: pages.length, imagePath: asset.localPath })
  }
  return pages
}

function preparedSlideCount(manifest: AssetManifest): number {
  return manifest.assets.reduce((n, a) => n + (a.kind === 'pdf' ? a.pages.length : 1), 0)
}

/** The old worker's pre-render check: every prepared page displayed, analyzed and narrated. */
async function coverageProblem(ws: Workspace): Promise<string | null> {
  const manifest = await readJson<AssetManifest>(manifestFile(ws))
  if (!manifest || manifest.assets.length === 0) return null
  const config = await readJson<{ storyboard?: VideoStoryboard }>(configFile(ws))
  const expected = expectedSlideshowSlideCount(preparedSlideCount(manifest), config?.storyboard)
  const progress = await readJson<SlideshowProgress>(
    path.join(recordingDir(ws), 'slideshow-progress.json'),
  )
  if (!progress)
    return 'Prepared assets were not displayed in an asset slideshow (demo_build_slideshow was never called).'
  try {
    validateSlideshowCoverage(progress, expected)
    return null
  } catch (err: any) {
    return err.message
  }
}

// ── recording lifecycle ──────────────────────────────────────────────────────

async function stopRecording(ws: Workspace): Promise<{ stopped: boolean; note: string }> {
  const handle = active.get(ws.dir)
  const live = await readJson<LiveFile>(liveFile(ws))
  if (!handle && !live) return { stopped: false, note: 'No recording is running.' }
  if (handle) {
    try {
      await handle.stop()
    } finally {
      active.delete(ws.dir)
    }
  } else if (live) {
    // The studio restarted while this workspace was recording: the browser may
    // still be up under the session name — close what we can.
    await execAsync(`playwright-cli -s=${live.session} video-stop`, { cwd: ws.dir }).catch(() => {})
    await execAsync(`playwright-cli -s=${live.session} close`, { cwd: ws.dir }).catch(() => {})
  }
  await rm(liveFile(ws), { force: true })
  const state = await readJson<DemoState>(stateFile(ws))
  if (state) await writeJson(stateFile(ws), { ...state, endTime: Date.now() })
  const clips = state?.audioClips?.length ?? 0
  return {
    stopped: true,
    note: `Recording stopped; browser closed. ${clips} narration/SFX clip(s), ${state?.zoomEvents?.length ?? 0} zoom event(s), ${state?.clickEvents?.length ?? 0} click(s).`,
  }
}

async function notifyPublished(
  ws: Workspace,
  projectId: string,
  videoUrl: string,
  options: Record<string, any>,
): Promise<void> {
  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: ws.userId } })
    const instructions = options.instructions
      ? `\nPrompt: *${String(options.instructions).slice(0, 300)}*`
      : ''
    await sendDiscordMessage(
      `✅ **Video Creation Completed**\nProject: \`${projectId}\`\nUser: ${profile?.email || ws.userId}\nTarget URL: ${options.url || 'N/A'}${instructions}\nOutput Video: ${videoUrl}`,
    )
    const email = await getClerkUserEmail(ws.userId)
    if (email)
      await sendJobCompleteEmail({
        to: email,
        jobId: projectId,
        videoUrl,
        videoTitle: hostOf(options.url) ?? options.productName ?? 'pitch.com',
      })
  } catch (err) {
    logger.warn({ err, projectId }, 'completion notifications failed')
  }
}

// ── host actions ─────────────────────────────────────────────────────────────

registerHostAction('demo_prepare_assets', async ws => {
  const project = await readProject(ws)
  const assets = project.uploads.filter(isAsset)
  if (assets.length === 0)
    return 'This project has no uploaded PDFs/images — nothing to prepare. Record the URL walkthrough directly.'
  await rm(path.join(recordingDir(ws), 'assets'), { recursive: true, force: true })
  const { manifest } = await prepareDemoAssets(ws.dir, assets)
  if (manifest.assets.length === 0)
    throw new Error('None of the uploaded PDFs/images could be prepared for video.')
  return `Prepared ${manifest.assets.length} asset(s) (${preparedSlideCount(manifest)} page(s)) into recording/assets/. demo_list_assets and demo_build_slideshow become available once demo_record_start has run.\n${formatAssetManifestForPrompt(manifest)}`
})

registerHostAction('demo_record_start', async (ws, params) => {
  if (active.has(ws.dir))
    throw new Error('A recording is already running in this project — call demo_record_stop first.')
  const stale = await readJson<LiveFile>(liveFile(ws))
  if (stale) await stopRecording(ws).catch(() => {})
  coverageWarned.delete(ws.dir)

  const project = await readProject(ws)
  const manifest = await readJson<AssetManifest>(manifestFile(ws))
  const assetCount = manifest?.assets.length ?? 0
  if (project.uploads.some(isAsset) && !manifest) {
    throw new Error(
      'The project has uploaded PDFs/images but demo_prepare_assets has not run — call it first.',
    )
  }

  // A storyboard in the workspace is the render contract for this recording.
  let storyboard: VideoStoryboard | undefined
  const draft = await readJson<VideoStoryboard>(storyboardFile(ws))
  if (draft) {
    storyboard =
      draft.status === 'approved' && draft.approvedRevision === draft.revision
        ? draft
        : approveVideoStoryboard(draft, draft.revision)
    if (storyboard !== draft) await writeJson(storyboardFile(ws), storyboard)
  }

  // A fresh take: previous events must not bleed into this recording.
  await rm(stateFile(ws), { force: true })
  await rm(path.join(recordingDir(ws), 'slideshow-progress.json'), { force: true })
  await rm(path.join(recordingDir(ws), 'pending-grounding.json'), { force: true })

  const handle = await startRecording(
    {
      userId: ws.userId,
      workspaceDir: ws.dir,
      voice: typeof project.options.voice === 'string' ? project.options.voice : undefined,
      assetsManifestPath: manifest ? manifestFile(ws) : undefined,
      storyboard,
    },
    logger,
  )
  active.set(ws.dir, handle)
  await writeJson(liveFile(ws), {
    profileId: handle.profileId,
    session: handle.session,
    startedAt: handle.startTime,
  } satisfies LiveFile)

  const url = typeof params.url === 'string' && params.url.trim() ? params.url.trim() : null
  let opened = ''
  if (url) {
    try {
      await execAsync(`playwright-cli -s=${handle.session} goto "${url.replace(/"/g, '')}"`, {
        cwd: ws.dir,
        timeout: 60_000,
      })
      opened = `\nOpened ${url} — snapshot it and start narrating as soon as it is visible.`
    } catch (err: any) {
      opened = `\nCould not open ${url} (${err.message}); open it yourself with pitch demo bash \`playwright-cli goto ${url}\`.`
    }
  }
  const lines = [
    `Recording started. Session "${handle.session}", startTime ${handle.startTime} (${new Date(handle.startTime).toISOString()}), voice ${project.options.voice || 'Puck'}. The browser is 1920x1080, open and recording — do not call playwright-cli open.${opened}`,
  ]
  if (assetCount > 0)
    lines.push(
      `${assetCount} prepared asset(s): call demo_list_assets, then demo_build_slideshow and goto the URL it returns.`,
    )
  if (storyboard) lines.push(storyboardContract(storyboard, assetCount))
  lines.push(
    'When the walkthrough and the logo capture are done: demo_record_stop, then demo_render.',
  )
  return lines.join('\n\n')
})

registerHostAction('demo_record_stop', async ws => {
  if (active.has(ws.dir) && !coverageWarned.has(ws.dir)) {
    const problem = await coverageProblem(ws)
    if (problem) {
      coverageWarned.add(ws.dir)
      return `NOT stopped — the prepared pages are not fully covered: ${problem}\nThe recording is still running: continue the slideshow (analyze, narrate, advance one page at a time) and call demo_record_stop again. If that is genuinely impossible, calling demo_record_stop once more stops anyway.`
    }
  }
  coverageWarned.delete(ws.dir)
  const { note } = await stopRecording(ws)
  return `${note} Next: demo_render.`
})

registerHostAction('demo_render', async (ws, params) => {
  const notes: string[] = []
  if (active.has(ws.dir) || existsSync(liveFile(ws))) {
    // The agent forgot to stop: never render over a live screencast.
    const { note } = await stopRecording(ws)
    notes.push(`The recording was still live — stopped it first. ${note}`)
  }
  const config = await readJson<{ startTime: number; storyboard?: VideoStoryboard }>(configFile(ws))
  if (!config?.startTime)
    throw new Error(
      'Nothing to render: no recording in this project yet (demo_record_start first).',
    )
  const state = (await readJson<DemoState>(stateFile(ws))) ?? {}
  if (!(state.audioClips?.length ?? 0))
    notes.push('Warning: the recording has no narration clips — the video will be silent.')
  const coverage = await coverageProblem(ws)
  if (coverage) notes.push(`Warning: ${coverage}`)

  const project = await readProject(ws)
  const o = project.options
  const pick = (key: string) =>
    params[key] !== undefined && params[key] !== null && params[key] !== '' ? params[key] : o[key]
  const options = {
    url: typeof o.url === 'string' ? o.url : undefined,
    background: pick('background') != null ? String(pick('background')) : undefined,
    shape: pick('shape') != null ? String(pick('shape')) : undefined,
    inset: pick('inset') as number | string | undefined,
    browserHeader: (pick('browserHeader') ?? 'none') as 'light' | 'dark' | 'none',
    productName: pick('productName') != null ? String(pick('productName')) : undefined,
    fps: pick('fps') as number | string | undefined,
    storyboard: config.storyboard,
  }
  // Remember the look the user (or the agent) settled on for the next render.
  const chosen = Object.fromEntries(
    ['background', 'shape', 'inset', 'browserHeader', 'productName', 'fps']
      .filter(k => params[k] !== undefined)
      .map(k => [k, params[k]]),
  )
  if (Object.keys(chosen).length)
    await writeJson(projectFile(ws), { ...project, options: { ...o, ...chosen } })
  // The encode is the heavy half: on a fleet it runs on a render pod against
  // the checkpoint (the stop above made sure demo.webm is on disk to be
  // checkpointed), here it runs in-process. Either way the MP4 lands in renders/.
  const encoded = await callHostAction(ws.dir, 'demo_encode', { options })
  return [encoded, ...notes].join('\n')
})

/** Encode a stopped recording to renders/ and publish it. Params: { options }. */
registerHostAction(
  'demo_encode',
  async (ws, params) => {
    const notes: string[] = []
    const config = await readJson<{ startTime: number; storyboard?: VideoStoryboard }>(
      configFile(ws),
    )
    if (!config?.startTime) throw new Error('Nothing to encode: no recording in this project.')
    const state = (await readJson<DemoState>(stateFile(ws))) ?? {}
    const options = (params.options ?? {}) as {
      url?: string
      background?: string
      shape?: string
      inset?: number | string
      browserHeader: 'light' | 'dark' | 'none'
      productName?: string
      fps?: number | string
      storyboard?: VideoStoryboard
    }
    const project = await readProject(ws)
    const o = project.options
    const rec = recordingDir(ws)
    const result = await renderDemo(
      {
        workspaceDir: ws.dir,
        webmPath: path.join(rec, 'demo.webm'),
        videoDir: rec,
        recordingStartedAtMs: config.startTime,
        state,
        startTime: config.startTime,
        assetsDir: ASSETS_DIR,
        options,
        outDir: rendersDir(ws),
        watermark: await shouldWatermarkVideo(ws.userId),
      },
      logger,
    )
    await rm(result.rawPath, { force: true })
    // The beat map lives next to the .mp4 so the studio can offer the scene strip
    // for this render (and only this one) after a restart.
    await writeTimeline(result.finalPath, {
      durationSec: result.durationSec,
      beats: result.beats,
    }).catch(err => logger.warn({ err }, 'could not write the render timeline'))

    const rel = `renders/${path.basename(result.finalPath)}`
    const local = fileUrl(ws.internal, rel)
    const row = await projectRow(ws)
    let published = local
    try {
      published = await storage.uploadFile(
        result.finalPath,
        undefined,
        `pitch/${ws.userId}/${ws.name}/videos`,
      )
      await addOutput(ws.userId, row.id, {
        kind: 'video',
        url: published,
        createdAt: new Date().toISOString(),
      })
      void notifyPublished(ws, row.id, published, { ...o, ...options })
    } catch (err) {
      logger.warn({ err, projectId: row.id }, 'render upload failed — serving the local file')
      await addOutput(ws.userId, row.id, {
        kind: 'video',
        url: local,
        createdAt: new Date().toISOString(),
      }).catch(() => {})
      notes.push(
        'Upload to storage failed; the video is only available from the workspace for now.',
      )
    }
    const look = `background ${options.background || 'none'}, shape ${options.shape || 'rounded'}, inset ${options.inset ?? 0.87}, browser header ${options.browserHeader}`
    return [
      `Rendered ${result.durationSec.toFixed(1)}s (leading trim ${result.leadingTrimSec.toFixed(1)}s) → ${rel} (${look}).`,
      `Video URL: ${published}`,
      ...notes,
    ].join('\n')
  },
  { remote: true },
)

registerHostAction('storyboard_plan', async ws => {
  const manifest = await readJson<AssetManifest>(manifestFile(ws))
  if (!manifest || manifest.assets.length === 0)
    throw new Error(
      'Storyboard planning needs prepared PDF/image pages — call demo_prepare_assets first.',
    )
  const pages = pagesOf(manifest)
  if (pages.length === 0) throw new Error('No PDF/image pages were available to plan.')
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  const model =
    process.env.GEMINI_GROUNDING_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash'
  const project = await readProject(ws)
  const storyboard = await buildStoryboardDraft(
    pages,
    {
      analyzePage: async page =>
        analyzeStoryboardPage({
          apiKey,
          model,
          imageBase64: (await readFile(page.imagePath)).toString('base64'),
          instructions:
            typeof project.options.instructions === 'string'
              ? project.options.instructions
              : undefined,
        }),
      uploadPreview: page =>
        storage.uploadFile(page.imagePath, undefined, `pitch/${ws.userId}/${ws.name}/storyboard`),
    },
    { script: typeof project.options.script === 'string' ? project.options.script : undefined },
  )
  await writeJson(storyboardFile(ws), storyboard)
  return `${storyboardSummary(storyboard)}\n\nSaved to storyboard.json. Edit it and storyboard_save to revise; demo_record_start records it as the approved contract.`
})

registerHostAction('storyboard_save', async (ws, params) => {
  const file = storyboardFile(ws)
  if (typeof params.json === 'string' && params.json.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(params.json)
    } catch (err: any) {
      return `Problems: the storyboard JSON you passed does not parse (${err.message}). Nothing saved.`
    }
    await writeJson(file, parsed)
  }
  const draft = await readJson<VideoStoryboard>(file)
  if (!draft) return 'Problems: storyboard.json is missing or not valid JSON. Nothing saved.'
  if (!Array.isArray(draft.scenes))
    return 'Problems: storyboard.json has no scenes array. Nothing saved.'
  try {
    const saved = updateVideoStoryboard(draft, {
      revision: draft.revision,
      transition: draft.transition,
      titleCards: draft.titleCards,
      scenes: draft.scenes,
    })
    await writeJson(file, saved)
    return `saved — revision ${saved.revision}, ${saved.scenes.filter(s => s.enabled).length} enabled scene(s).${params.summary ? ` ${params.summary}` : ''} The next demo_record_start records this revision.`
  } catch (err: any) {
    return `Problems: ${err.message}\nFix storyboard.json and call storyboard_save again (nothing was saved).`
  }
})

// ── the flow ─────────────────────────────────────────────────────────────────

function optionSummary(options: Record<string, any>, uploads: number): string {
  const rows: string[] = []
  if (options.url) rows.push(`URL: ${options.url}`)
  if (options.instructions) rows.push(`Instructions: ${options.instructions}`)
  if (options.script) rows.push('Voiceover script: provided (below)')
  rows.push(`Voice: ${options.voice || 'Puck'}`)
  rows.push(`Uploads: ${uploads}`)
  rows.push(
    `Look: background ${options.background || 'none'}, shape ${options.shape || 'rounded'}, inset ${options.inset ?? 0.87}, browser header ${options.browserHeader || 'none'}`,
  )
  return rows.join('\n')
}
