import { existsSync } from 'node:fs'
import path from 'node:path'
import * as db from '@saas/db'
import { createLogger, isLaunchVideoResolution, JOB_UPDATES_CHANNEL } from '@saas/shared'
import * as storage from '@saas/storage'
import express, { Router } from 'express'
import { connection } from '../config.js'
import {
  createLaunchVideoJob,
  InsufficientCreditsError,
  OnboardingRequiredError,
} from '../lib/job-service.js'
import { listMusic } from '../lib/launch-video/music.js'
import {
  eventSessionId,
  eventStream,
  getMessages,
  getSessionForProject,
  getSessionOwnerId,
  getSessionState,
  type OpencodeEvent,
  prompt,
  resetEventStream,
} from '../lib/launch-video/opencode.js'
import { MUSIC_DIR, RENDERS_DIR, toInternalName } from '../lib/launch-video/paths.js'
import {
  getProject,
  listProjects,
  mergeLaunchVideoJobs,
  resolveLaunchVideoProjectDetail,
} from '../lib/launch-video/projects.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:launch-video')

export const router = Router()

/** Project names double as directory names — keep path traversal out. */
function isValidProjectName(name: string): boolean {
  return /^[^/\\]+$/.test(name) && name !== '..' && name !== '.' && !name.startsWith('.')
}

// --- SSE fan-out: one opencode event stream, many browser listeners ---------

interface SseClient {
  sessionId: string
  userId: string
  projectName: string
  send: (ev: OpencodeEvent) => void
}
const sseClients = new Set<SseClient>()
let pumpStarted = false
const renderSyncs = new Map<string, Promise<void>>()

function isIdleEvent(ev: OpencodeEvent): boolean {
  return (
    ev.type === 'session.idle' ||
    (ev.type === 'session.status' && (ev.properties as any)?.status?.type === 'idle')
  )
}

async function syncEditedRender(userId: string, projectName: string): Promise<void> {
  const internal = toInternalName(userId, projectName)
  const launchFile = path.join(RENDERS_DIR, `${internal}-launch.mp4`)
  const draftFile = path.join(RENDERS_DIR, `${internal}-draft.mp4`)
  const renderFile = existsSync(launchFile) ? launchFile : existsSync(draftFile) ? draftFile : null
  if (!renderFile) {
    logger.warn({ userId, projectName }, 'Edited launch-video session ended without a render')
    return
  }

  const jobs = await db.listJobs({ id: userId })
  const job = jobs.find(
    item =>
      item.parameters?.jobType === 'launch-video' && item.parameters?.projectName === projectName,
  )
  if (!job) {
    logger.warn({ userId, projectName }, 'No launch-video job found for edited render')
    return
  }

  const videoUrl = await storage.uploadFile(
    renderFile,
    undefined,
    `pitch/${userId}/${projectName}/videos`,
  )
  const updatedJob = await db.updateJob(job.id, { videoUrl })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
  // S3 keys are unique per upload, so the project URL changes after an edit.
  // Nudge the studio to re-fetch now that the new render is live.
  for (const c of sseClients) {
    if (c.userId === userId && c.projectName === projectName) {
      c.send({ type: 'render.updated', properties: { videoUrl } })
    }
  }
  logger.info({ userId, projectName, jobId: job.id, videoUrl }, 'Edited render uploaded')
}

function queueEditedRenderSync(client: SseClient): void {
  const key = `${client.userId}--${client.projectName}`
  if (renderSyncs.has(key)) return
  const sync = syncEditedRender(client.userId, client.projectName)
    .catch(error => {
      logger.error(
        { err: error, userId: client.userId, projectName: client.projectName },
        'Failed to upload edited launch-video render',
      )
    })
    .finally(() => renderSyncs.delete(key))
  renderSyncs.set(key, sync)
}

async function startEventPump(): Promise<void> {
  if (pumpStarted) return
  pumpStarted = true
  try {
    const stream = await eventStream()
    for await (const ev of stream) {
      const sid = eventSessionId(ev)
      let projectClient: SseClient | null = null
      for (const c of sseClients) {
        if (!sid || sid === c.sessionId) {
          c.send(ev)
          if (sid === c.sessionId) projectClient ??= c
        }
      }
      if (projectClient && isIdleEvent(ev)) queueEditedRenderSync(projectClient)
    }
    logger.warn('opencode event stream ended')
  } catch (err) {
    logger.error({ err }, 'opencode event stream error')
  } finally {
    pumpStarted = false
    resetEventStream()
    // If browsers are still listening, re-establish the stream.
    if (sseClients.size > 0) {
      setTimeout(() => void startEventPump(), 2000)
    }
  }
}

// --- API --------------------------------------------------------------------

router.get('/projects', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const [projects, jobs] = await Promise.all([listProjects(userId), db.listJobs({ id: userId })])
    res.json(mergeLaunchVideoJobs(projects, jobs))
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list launch-video projects')
    res.status(500).json({ error: error.message })
  }
})

router.get('/projects/:name/scenes', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  if (!isValidProjectName(req.params.name)) {
    return res.status(400).json({ error: 'invalid project name' })
  }
  try {
    const [localProject, jobs] = await Promise.all([
      getProject(userId, req.params.name),
      db.listJobs({ id: userId }),
    ])
    const project = resolveLaunchVideoProjectDetail(localProject, req.params.name, jobs)
    if (!project) return res.status(404).json({ error: 'project not found' })
    res.json(project)
  } catch (error: any) {
    logger.error({ err: error, userId, project: req.params.name }, 'Failed to get project scenes')
    res.status(500).json({ error: error.message })
  }
})

router.get('/music', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json(await listMusic())
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to list music')
    res.status(500).json({ error: error.message })
  }
})

router.post('/projects/:name/prompt', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  const { name } = req.params
  if (!isValidProjectName(name)) {
    return res.status(400).json({ error: 'invalid project name' })
  }
  const text = String(req.body?.text ?? '').trim()
  const music = String(req.body?.music ?? '').trim()
  const resolution = String(req.body?.resolution ?? '').trim()
  // Narration defaults ON; only an explicit `false` selects a music-only film.
  const narration = req.body?.narration === false ? false : true
  if (!text) return res.status(400).json({ error: 'text is required' })
  if (resolution && !isLaunchVideoResolution(resolution)) {
    return res.status(400).json({ error: 'invalid resolution' })
  }

  try {
    const job = await createLaunchVideoJob(
      userId,
      name,
      text,
      music || undefined,
      resolution || undefined,
      narration,
    )
    res.status(202).json({ jobId: job.id })
  } catch (error: any) {
    if (error instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: 'Insufficient credits', balance: error.balance })
    }
    if (error instanceof OnboardingRequiredError)
      return res.status(428).json({ error: error.message })
    logger.error({ err: error, userId, project: name }, 'Failed to create launch-video job')
    res.status(500).json({ error: error.message })
  }
})

router.post('/projects/:name/scenes/:sceneId/prompt', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  const { name, sceneId } = req.params
  if (!isValidProjectName(name)) {
    return res.status(400).json({ error: 'invalid project name' })
  }
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: 'text is required' })

  try {
    const internal = toInternalName(userId, name)
    const project = await getProject(userId, name)
    if (!project) return res.status(404).json({ error: 'project not found' })
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return res.status(404).json({ error: 'scene not found' })

    const scoped =
      `Update scene "${sceneId}" (index ${scene.index}, ${scene.start.toFixed(1)}s–${scene.end.toFixed(1)}s) ` +
      `of the video project in projects/${internal}/. The scene's animation code is in ` +
      `projects/${internal}/js/scenes/${sceneId}.js (styling in css/, timing in js/timing.js — keep ` +
      `the scene duration unchanged unless the update genuinely requires otherwise). ` +
      `Requested change: ${text}\n\n` +
      `After editing, re-render just this scene segment with motion_render ` +
      `(from=${scene.start.toFixed(1)} to=${scene.end.toFixed(1)}) to verify, ` +
      `then run a fresh full render to renders/${internal}-launch.mp4 so the app picks up the new cut.`

    const { id: sessionId } = await getSessionForProject(userId, name)
    const state = await getSessionState(sessionId)
    if (state.busy) {
      return res.status(409).json({
        error: 'This project is already processing an edit',
        sessionId,
      })
    }
    await prompt(sessionId, `Update ${sceneId}: ${text}`, scoped)
    res.json({ sessionId })
  } catch (error: any) {
    logger.error(
      { err: error, userId, project: name, sceneId },
      'Failed to send launch-video scene prompt',
    )
    res.status(500).json({ error: error.message })
  }
})

router.get('/sessions/:id/messages', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    // Sessions are user-owned — don't let one user read another's agent chat.
    const ownerId = await getSessionOwnerId(req.params.id)
    if (ownerId !== userId) return res.status(404).json({ error: 'session not found' })
    res.json(await getMessages(req.params.id))
  } catch (error: any) {
    logger.error({ err: error, userId, sessionId: req.params.id }, 'Failed to get session messages')
    res.status(500).json({ error: error.message })
  }
})

router.get('/projects/:name/session-state', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  if (!isValidProjectName(req.params.name)) {
    return res.status(400).json({ error: 'invalid project name' })
  }

  try {
    // The initial session can belong to a worker's OpenCode server. Validate it
    // against this API process and replace it before attaching the live stream.
    const { id: sessionId } = await getSessionForProject(userId, req.params.name)
    const state = await getSessionState(sessionId)
    res.json({ sessionId, ...state })
  } catch (error: any) {
    logger.error(
      { err: error, userId, project: req.params.name },
      'Failed to read launch-video session state',
    )
    res.status(500).json({ error: error.message })
  }
})

router.get('/projects/:name/events', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  if (!isValidProjectName(req.params.name)) {
    return res.status(400).json({ error: 'invalid project name' })
  }

  try {
    const { id: sessionId } = await getSessionForProject(userId, req.params.name)
    const state = await getSessionState(sessionId)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(
      `data: ${JSON.stringify({ type: 'session', properties: { sessionId, ...state } })}\n\n`,
    )

    const client: SseClient = {
      sessionId,
      userId,
      projectName: req.params.name,
      send: ev => res.write(`data: ${JSON.stringify(ev)}\n\n`),
    }
    sseClients.add(client)
    void startEventPump()

    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000)
    req.on('close', () => {
      clearInterval(keepAlive)
      sseClients.delete(client)
    })
  } catch (error: any) {
    logger.error(
      { err: error, userId, project: req.params.name },
      'Failed to open launch-video event stream',
    )
    res.status(500).json({ error: error.message })
  }
})

// --- Static (auth-gated; browsers pass ?token= for <video>/<audio> tags) -----

router.use('/files/videos', (req, res, next) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  // Renders are namespaced `<userId>--<project>-*.mp4` — only serve the
  // requester's own prefix.
  const file = decodeURIComponent(req.path).replace(/^\//, '')
  if (!file.startsWith(`${userId}--`)) return res.status(404).json({ error: 'not found' })
  next()
})
router.use('/files/videos', express.static(RENDERS_DIR))
router.use('/files/music', (req, res, next) => {
  if (requireAuth(req, res)) next()
})
router.use('/files/music', express.static(MUSIC_DIR))
