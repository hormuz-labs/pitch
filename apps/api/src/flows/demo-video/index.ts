/**
 * Demo capture: prepare the user's browser, record one narrated walkthrough,
 * and assemble its synchronized source for the shared video-editing pipeline.
 *
 * Workspace layout
 *   project.json         { userId, options, uploads }  — what the tools read
 *   uploads/<name>       the user's PDFs/images
 *   recording/           demo-config.json, demo-state.json, demo.webm, audio/,
 *                        assets/assets.json (manifest), live.json while recording
 *   storyboard.json      draft/approved storyboard (asset projects, optional)
 *   recording/source-*.mp4  synchronized editing source
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as db from '@saas/db'
import {
  approveVideoStoryboard,
  createLogger,
  updateVideoStoryboard,
  type VideoStoryboard,
} from '@saas/shared'
import * as storage from '@saas/storage'
import type { DemoState as CaptureState } from '../../../../../.pi/lib/demo-state.ts'
import {
  assertBrowserCommandSucceeded,
  waitForNarration,
} from '../../../../../.pi/lib/demo-timing.ts'
import { resolveSymlinks } from '../../../../../.pi/lib/paths.ts'
import { execAsync, getVideoBirthTimeMs } from '../../render/media.js'
import { prepareDemoAssets, type RecordingHandle, startRecording } from '../../render/recording.js'
import { type AssetManifest, formatAssetManifestForPrompt } from '../../render/utils/assets.js'
import { buildDemoJobInput } from '../../render/utils/demo-job-input.js'
import type { CursorEvent } from '../../render/utils/recording-cursor.js'
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
import { runVideoEditing } from '../../render/video-editing/index.js'
import { demoStreamId } from '../../services/browser-routing.js'
import { callHostAction, type HostContext, registerHostAction } from '../../studio/host-actions.js'
import { ASSETS_DIR, type Workspace } from '../../studio/paths.js'
import { WORKER_ID } from '../../worker/config.js'
import { currentEpoch } from '../../worker/registry.js'
import type { UploadRef } from '../types.js'

const logger = createLogger('studio:demo-video')

type DemoState = Partial<CaptureState>

interface ProjectFile {
  userId: string
  options: Record<string, any>
  uploads: UploadRef[]
}

interface LiveFile {
  streamId: string
  session: string
  startedAt: number
}

/** Browser/capture handles owned by this worker, keyed by workspace. */
const active = new Map<string, RecordingHandle>()
/** Workspaces whose demo_record_stop was already refused once for missing pages. */
const coverageWarned = new Set<string>()

// ── workspace files ──────────────────────────────────────────────────────────

const projectFile = (ws: Workspace) => path.join(ws.dir, 'project.json')
const recordingDir = (ws: Workspace) => path.join(ws.dir, 'recording')
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
  const wasRecording = handle?.recording || !!live
  let stopError: unknown
  if (handle) {
    try {
      await handle.stop()
    } catch (error) {
      stopError = error
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
  await rm(path.join(recordingDir(ws), 'browser.json'), { force: true })
  const state = await readJson<DemoState>(stateFile(ws))
  if (state && wasRecording) await writeJson(stateFile(ws), { ...state, endTime: Date.now() })
  if (stopError) throw stopError
  const clips = state?.audioClips?.length ?? 0
  return {
    stopped: true,
    note: `Recording stopped; browser closed. ${clips} narration/SFX clip(s), ${state?.clickEvents?.length ?? 0} click(s).`,
  }
}

/** Worker lifecycle hook: finalize and remove a live recording before release. */
export async function releaseDemoRecording(ws: Workspace): Promise<void> {
  await stopRecording(ws)
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

async function openDemo(
  ws: Workspace,
  params: Record<string, any>,
  ctx: HostContext,
  rehearse: boolean,
): Promise<string> {
  const existing = active.get(ws.dir)
  if (existing?.recording)
    return 'The continuous take is already recording. Keep it open; use demo bash to snapshot and continue. Stop only after the final demonstrated result.'
  if (existing && rehearse)
    return 'Preparation browser is already open, without recording. Continue with demo bash; use goto to navigate, then record-start when ready.'
  if (
    !rehearse &&
    existsSync(path.join(recordingDir(ws), 'demo.webm')) &&
    !String(params.retakeReason ?? '').trim()
  ) {
    throw new Error(
      'A take already exists. Use demo source and inspect that footage, or browser-open for exploration. Only record missing content after correcting the route, with --retake-reason naming the missing step or failed capture. The saved take is unchanged.',
    )
  }
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

  const row = await projectRow(ws)
  const handle =
    existing ??
    (await startRecording(
      {
        userId: ws.userId,
        workspaceDir: ws.dir,
        streamId: demoStreamId(row.id, WORKER_ID, currentEpoch()),
        voice: typeof project.options.voice === 'string' ? project.options.voice : undefined,
        assetsManifestPath: manifest ? manifestFile(ws) : undefined,
        storyboard,
        signal: ctx.signal,
        deferCapture: true,
      },
      logger,
    ))
  active.set(ws.dir, handle)
  await writeJson(path.join(recordingDir(ws), 'browser.json'), {
    streamId: handle.streamId,
    session: handle.session,
    startedAt: Date.now(),
    startTime: Date.now(),
    voiceName: project.options.voice || 'Charon',
    assetsManifestPath: manifest ? manifestFile(ws) : undefined,
    storyboard,
  })

  const url = typeof params.url === 'string' && params.url.trim() ? params.url.trim() : null
  let opened = ''
  if (url) {
    try {
      assertBrowserCommandSucceeded(
        await execAsync(
          `playwright-cli -s=${handle.session} goto "${url.replace(/["\\$`]/g, '\\$&')}"`,
          {
            cwd: ws.dir,
            timeout: 60_000,
          },
        ),
      )
      opened = `\nOpened ${url} — take a fresh snapshot and verify the starting view.`
    } catch (err: any) {
      throw new Error(
        `Could not open ${url}: ${err.message}. The preparation browser remains open, without recording. Recover with demo bash goto/snapshot, then record-start.`,
      )
    }
  }
  if (rehearse)
    return `Browser ready for preparation, NOT recording.${opened}\nUse demo bash to inspect the real workflow. Keep this session open, return to the starting view and call record-start once. Fresh snapshots supply refs; do not reuse refs from an earlier browser.`
  await handle.startCapture({
    voice: typeof project.options.voice === 'string' ? project.options.voice : undefined,
    assetsManifestPath: manifest ? manifestFile(ws) : undefined,
    storyboard,
  })
  await writeJson(liveFile(ws), {
    streamId: handle.streamId,
    session: handle.session,
    startedAt: handle.startTime,
  } satisfies LiveFile)
  const lines = [
    `Recording started. Session "${handle.session}", startTime ${handle.startTime} (${new Date(handle.startTime).toISOString()}), voice ${project.options.voice || 'Charon'}. The browser is 1920x1080, open and recording — do not call playwright-cli open.${opened}`,
  ]
  if (assetCount > 0)
    lines.push(
      `${assetCount} prepared asset(s): call demo_list_assets, then demo_build_slideshow and goto the URL it returns.`,
    )
  if (storyboard) lines.push(storyboardContract(storyboard, assetCount))
  lines.push(
    'Keep this ONE take open through the complete workflow. Use narrate --action to demonstrate while speaking; verify actual results after each transition. Do not stop to inspect or debug. After the final visible result: record-stop (waits for speech), then video-editing/SKILL.md and demo source.',
  )
  return lines.join('\n\n')
}

registerHostAction('demo_browser_open', (ws, params, ctx) => openDemo(ws, params, ctx, true))
registerHostAction('demo_record_start', (ws, params, ctx) => openDemo(ws, params, ctx, false))
registerHostAction('demo_browser_close', async ws => {
  if (active.get(ws.dir)?.recording)
    throw new Error('A take is recording. Continue it; use record-stop after the final result.')
  await stopRecording(ws)
  return 'Preparation browser closed. Existing recordings were preserved.'
})

registerHostAction('demo_record_stop', async (ws, _params, ctx) => {
  if (active.get(ws.dir)?.recording && !coverageWarned.has(ws.dir)) {
    const problem = await coverageProblem(ws)
    if (problem) {
      coverageWarned.add(ws.dir)
      return `NOT stopped — the prepared pages are not fully covered: ${problem}\nThe recording is still running: continue the slideshow (analyze, narrate, advance one page at a time) and call demo_record_stop again. If that is genuinely impossible, calling demo_record_stop once more stops anyway.`
    }
  }
  coverageWarned.delete(ws.dir)
  const state = await readJson<DemoState>(stateFile(ws))
  if (active.get(ws.dir)?.recording) await waitForNarration(state?.narrationEndTime, ctx.signal)
  const { note } = await stopRecording(ws)
  return `${note} Next: read video-editing/SKILL.md, then pitch demo source. Edit the synchronized source with pitch video commands.`
})

registerHostAction('demo_source', async (ws, _params, ctx) => {
  if (active.has(ws.dir) || existsSync(liveFile(ws)))
    throw new Error('Stop the recording with pitch demo record-stop before preparing its source.')
  const config = await readJson<{ startTime: number; videoStartTime?: number; cursor?: string }>(
    configFile(ws),
  )
  if (!Number.isFinite(config?.startTime)) throw new Error('No stopped recording configuration.')
  const state = (await readJson<DemoState>(stateFile(ws))) ?? {}
  const source = path.join(recordingDir(ws), 'demo.webm')
  const root = resolveSymlinks(ws.dir)
  if (!resolveSymlinks(source).startsWith(`${root}${path.sep}`))
    throw new Error('Recording path escapes the workspace.')
  // Host capture timestamps zero at its first frame. File creation time can
  // precede that frame and must not shift narration on new recordings.
  const birth = Number.isFinite(config?.videoStartTime)
    ? config!.videoStartTime!
    : await getVideoBirthTimeMs(source, logger)
  if (birth === null) throw new Error('Cannot determine the recording timebase.')
  const offset = Math.max(0, (config!.startTime - birth) / 1000)
  let clips = (state.audioClips ?? []).map(clip => {
    // Older capture tools persisted absolute paths. The internal workspace name
    // is stable across placement; rebase that prefix before checking the file.
    const marker = `${path.sep}${ws.internal}${path.sep}`
    const at = clip.filePath.indexOf(marker)
    const relative =
      path.isAbsolute(clip.filePath) && at >= 0
        ? clip.filePath.slice(at + marker.length)
        : clip.filePath
    let absolute = path.resolve(ws.dir, relative)
    if (!existsSync(absolute) && path.basename(absolute) === 'click.mp3') {
      const candidates = [
        path.join(ASSETS_DIR, 'sounds', 'click.mp3'),
        path.join(ASSETS_DIR, 'sfx', 'click.mp3'),
      ]
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          const target = path.join(ws.dir, 'recording', 'audio', 'click.mp3')
          mkdirSync(path.dirname(target), { recursive: true })
          try {
            copyFileSync(candidate, target)
            absolute = target
            break
          } catch {}
        }
      }
    }
    const real = resolveSymlinks(absolute)
    if (!real.startsWith(`${root}${path.sep}`))
      throw new Error('Recorded audio path escapes the workspace.')
    if (!Number.isFinite(clip.absoluteTimestamp))
      throw new Error('Invalid recorded audio timestamp.')
    return {
      source: path.relative(ws.dir, absolute),
      start: Math.max(0, (clip.absoluteTimestamp - config!.startTime) / 1000 + offset),
      ...(clip.durationSec ? { duration: clip.durationSec } : {}),
      text: clip.text,
    }
  })
  if (config?.cursor) {
    const cursorPath = resolveSymlinks(path.resolve(ws.dir, config.cursor))
    if (!cursorPath.startsWith(`${root}${path.sep}`))
      throw new Error('Cursor path escapes the workspace.')
    const trace = await readJson<{
      version: number
      complete: boolean
      startTime: number
      events: CursorEvent[]
    }>(cursorPath)
    if (
      trace?.version !== 2 ||
      !trace.complete ||
      trace.startTime !== birth ||
      !Array.isArray(trace.events)
    )
      throw new Error(
        'Missing, incomplete or mismatched cursor telemetry; recover the capture or retake.',
      )
    // Old click SFX were stamped before multiple CLI round-trips. Align them to
    // the actual pointer press too, rather than letting sound lead the new cursor.
    const sound = clips.find(clip => path.basename(clip.source) === 'click.mp3')
    clips = clips.filter(clip => path.basename(clip.source) !== 'click.mp3')
    if (sound)
      for (const event of trace.events) {
        if (event.kind === 'down' && event.buttons & 1) clips.push({ ...sound, start: event.time })
      }
  }
  // Resolve the clock and worker-local audio paths before remote placement.
  return callHostAction(
    ws.dir,
    'demo_source_encode',
    {
      source: 'recording/demo.webm',
      clips,
      ...(config?.cursor ? { cursor: config.cursor, capture_start: birth } : {}),
    },
    ctx,
  )
})

registerHostAction(
  'demo_source_encode',
  (ws, params, ctx) => runVideoEditing(ws.dir, 'assemble_recording', params, ctx.signal),
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
