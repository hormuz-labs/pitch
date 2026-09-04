/**
 * The studio agent — one agent, every tool, any project.
 *
 * This replaces the four flows. A project is a workspace and a conversation;
 * what it is making is decided by the request, turn by turn, and can change.
 * The pipelines survive as host tools and skills (see agent/toolkit.ts), and
 * the preview follows whatever artifact is newest (see agent/describe.ts).
 *
 * Workspace layout — the union of what every pipeline expects, seeded the
 * same way every time so none of them has to ask what kind of project it is:
 *
 *   project.json              { userId, options, uploads }
 *   uploads/<name>            everything the user attached, verbatim
 *   recording/upload.<ext>    the attached video, where the editor looks
 *   input/<name>              an attached PDF/PPTX, parsed into build/
 *   build/                    deck working directory
 *   renders/                  finished media
 *   vendor/gsap/              the launch engine's runtime
 *   audio/                    music bed and narration
 */
import { cpSync, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import { deckUpload, modeOf, parseUpload } from '../flows/deck/index.js'
import { stageMusic } from '../flows/launch-video/index.js'
import { download, extOf } from '../flows/recording-edit/index.js'
import type { Description, TurnInput, UploadRef } from '../flows/types.js'
import { describeBeat, readTimeline, scenesFromTimeline } from '../render/utils/beats.js'
import { MOTION_SKILL_DIR, type Workspace } from '../studio/paths.js'
import { describeWorkspace, hasArtifact, RELEVANT } from './describe.js'
import { BUILTIN_TOOLS, EXTENSIONS, skills, systemPrompt } from './toolkit.js'

const logger = createLogger('studio:agent')

const VIDEO_UPLOAD = /\.(mp4|webm|mov|mkv|avi)$/i
const isVideo = (u: UploadRef) => u.type.startsWith('video/') || VIDEO_UPLOAD.test(u.name)

interface ProjectFile {
  userId: string
  options: Record<string, any>
  uploads: UploadRef[]
}

const projectFile = (ws: Workspace) => path.join(ws.dir, 'project.json')

async function readProjectFile(ws: Workspace): Promise<ProjectFile> {
  try {
    return JSON.parse(await readFile(projectFile(ws), 'utf8')) as ProjectFile
  } catch {
    return { userId: ws.userId, options: {}, uploads: [] }
  }
}

/**
 * Seed the workspace. Everything lands where every pipeline already looks, so
 * the agent can change its mind about what it is building without anything
 * needing to be moved or re-downloaded.
 */
export async function prepareWorkspace(
  ws: Workspace,
  options: Record<string, any>,
  uploads: UploadRef[],
): Promise<void> {
  await Promise.all(
    ['uploads', 'recording', 'renders', 'build', 'audio'].map(d =>
      mkdir(path.join(ws.dir, d), { recursive: true }),
    ),
  )

  // The launch engine's runtime, once. Cheap, and the alternative is a project
  // that cannot become a launch film later.
  const vendorDst = path.join(ws.dir, 'vendor', 'gsap')
  const vendorSrc = path.join(MOTION_SKILL_DIR, 'vendor', 'gsap')
  if (!existsSync(vendorDst) && existsSync(vendorSrc))
    cpSync(vendorSrc, vendorDst, { recursive: true })

  const previous = await readProjectFile(ws)
  const known = new Map((previous.uploads ?? []).map(u => [u.url, u]))

  for (const upload of uploads) {
    const name = path.basename(upload.name).replace(/[^\w.-]+/g, '_') || 'upload'
    try {
      await download(upload.url, path.join(ws.dir, 'uploads', name))
      // A video is also the recording editor's input, at the fixed path it
      // expects. One upload per workspace: drop an earlier one with a
      // different extension so a stale plan cannot outlive it.
      if (isVideo(upload)) {
        const ext = extOf(upload.name)
        const dir = path.join(ws.dir, 'recording')
        for (const f of await readdir(dir).catch(() => [] as string[]))
          if (/^upload\.[a-z0-9]+$/i.test(f) && f !== `upload${ext}`)
            await rm(path.join(dir, f), { force: true })
        await download(upload.url, path.join(dir, `upload${ext}`))
        for (const stale of ['demo-state.json', 'edit-session.json'])
          await rm(path.join(dir, stale), { force: true })
      }
    } catch (err) {
      logger.warn({ err, url: upload.url, ws: ws.internal }, 'could not stage upload')
    }
    known.set(upload.url, upload)
  }

  // A PDF or PPTX is also a deck the agent can rebuild; parsing it up front
  // costs one pass and saves a round trip if that is what the user wanted.
  const deck = deckUpload(uploads)
  if (deck) {
    try {
      const { file, slides } = await parseUpload(ws, deck, modeOf(options))
      options.inputFile = file
      logger.info({ workspace: ws.internal, file, slides }, 'attached presentation parsed')
    } catch (err) {
      logger.warn({ err, ws: ws.internal }, 'could not parse the attached presentation')
    }
  }

  if (typeof options.music === 'string' && options.music) await stageMusic(ws, options.music)

  await writeFile(
    projectFile(ws),
    `${JSON.stringify(
      {
        userId: ws.userId,
        options: { ...(previous.options ?? {}), ...options },
        uploads: [...known.values()],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

/** A short inventory of the workspace, so the agent starts from what is there. */
async function inventory(ws: Workspace): Promise<string> {
  const lines: string[] = []
  const project = await readProjectFile(ws)
  for (const u of project.uploads ?? [])
    lines.push(`- uploads/${path.basename(u.name)} (${u.type || 'file'})`)
  if (existsSync(path.join(ws.dir, 'deck.html'))) lines.push('- deck.html (a slide deck)')
  if (existsSync(path.join(ws.dir, 'js', 'shots.js'))) lines.push('- js/shots.js (a launch film)')
  const renders = await readdir(path.join(ws.dir, 'renders')).catch(() => [] as string[])
  for (const r of renders.filter(f => /\.mp4$/i.test(f) && !f.startsWith('__') && f !== 'raw.mp4'))
    lines.push(`- renders/${r}`)
  const recording = await readdir(path.join(ws.dir, 'recording')).catch(() => [] as string[])
  for (const r of recording.filter(f => /^upload\./i.test(f)))
    lines.push(`- recording/${r} (the recording the user attached)`)
  return lines.length
    ? `The workspace already holds:\n${lines.join('\n')}`
    : 'The workspace is empty.'
}

function optionSummary(options: Record<string, any>): string {
  const interesting = Object.entries(options).filter(
    ([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'inputFile',
  )
  return interesting.length
    ? interesting
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ')
    : '(none)'
}

/** Per-turn steering, appended in a <studio-context> block. */
export async function buildContext(ws: Workspace, turn: TurnInput): Promise<string> {
  const project = await readProjectFile(ws)
  const options = { ...project.options, ...turn.options }
  const parts: string[] = []

  parts.push(
    turn.first
      ? `New project "${ws.name}". ${await inventory(ws)}\nOptions the user chose: ${optionSummary(options)}.\n\nDecide what they are asking for, read the matching skill, and build it. Do not ask questions first — make the creative decisions yourself and report what you made.`
      : `You are iterating on "${ws.name}". ${await inventory(ws)}\nOptions: ${optionSummary(options)}.\n\nApply exactly what the user asked for. A small change is a small edit, not a rebuild — reach for the media_* tools before regenerating anything.`,
  )

  if (turn.slide) parts.push(`The user is looking at slide ${turn.slide}.`)

  if (turn.scene?.startsWith('beat-')) {
    const desc = await describeWorkspace(ws)
    const beat = describeBeat(desc.scenes ?? [], turn.scene)
    if (beat)
      parts.push(
        `The user selected the ${beat}. Their request is about that stretch of the video — change only what covers it.`,
      )
  } else if (turn.scene) {
    parts.push(`The user is looking at scene "${turn.scene}".`)
  }

  if (turn.targets?.length) {
    const lines = turn.targets.map((t, i) => {
      // A file the user picked off the shelf. The path is workspace-relative,
      // which is what every tool takes, so say so plainly and let the agent
      // use it verbatim rather than going looking for it.
      if (typeof t.asset === 'string' && t.asset)
        return t.page
          ? `[${i + 1}] page ${t.page} of ${t.asset}`
          : `[${i + 1}] the file ${t.asset}${t.assetOrigin ? ` (${t.assetOrigin})` : ''}`
      // A selection on a video is a time, not a node: a range the user dragged
      // across the track, or a single moment they clicked.
      if (typeof t.time === 'number') {
        const start = Number(t.time)
        const end = typeof t.endTime === 'number' ? Number(t.endTime) : null
        const where =
          end !== null && end > start
            ? `${start.toFixed(2)}s to ${end.toFixed(2)}s (${(end - start).toFixed(2)}s of the video)`
            : `the moment at ${start.toFixed(2)}s`
        return `[${i + 1}] ${where}${t.text ? ` — "${t.text}"` : ''}`
      }
      const where = t.slide
        ? `slide ${t.slide}`
        : t.sceneId
          ? `scene ${t.sceneId}`
          : 'the current view'
      return `[${i + 1}] <${t.tagName}${t.className ? ` class="${t.className}"` : ''}> in ${where}${t.text ? ` — "${t.text}"` : ''}${t.selector ? ` · selector: ${t.selector}` : ''}`
    })
    const timed = turn.targets.some(t => typeof t.time === 'number')
    const filed = turn.targets.some(t => typeof t.asset === 'string' && t.asset)
    parts.push(
      [
        `The user selected these and referenced them as [n] below:`,
        lines.join('\n'),
        timed
          ? 'Those times are on the video that is on screen now. Work on exactly that span — media_probe it first, then one media_ffmpeg edit — and leave the rest of the video untouched.'
          : null,
        filed
          ? 'Those paths are workspace-relative and already exist — pass them straight to a tool. They are material to USE, not the artifact to change.'
          : null,
        timed || filed ? null : 'Change these, not their neighbours.',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return parts.join('\n\n')
}

export async function describe(ws: Workspace): Promise<Description> {
  return describeWorkspace(ws)
}

/** Whether the workspace holds anything worth keeping. */
export async function hasResult(ws: Workspace): Promise<boolean> {
  const desc = await describeWorkspace(ws)
  return desc.preview !== null || desc.outputs.length > 0
}

export const studioAgent = {
  extensions: EXTENSIONS,
  builtinTools: BUILTIN_TOOLS,
  sandbox: true,
  relevant: RELEVANT,
  skills,
  systemPrompt,
  prepare: prepareWorkspace,
  describe,
  context: buildContext,
  hasResult,
  hasArtifact,
}

export { readTimeline, scenesFromTimeline }
