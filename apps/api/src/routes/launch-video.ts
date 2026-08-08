import { createLogger } from '@saas/shared'
import express, { Router } from 'express'
import { listMusic } from '../lib/launch-video/music.js'
import {
  eventSessionId,
  eventStream,
  getMessages,
  getSessionForProject,
  getSessionOwnerId,
  type OpencodeEvent,
  prompt,
  resetEventStream,
} from '../lib/launch-video/opencode.js'
import { MUSIC_DIR, RENDERS_DIR, toInternalName } from '../lib/launch-video/paths.js'
import { getProject, listProjects } from '../lib/launch-video/projects.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:launch-video')

export const router = Router()

/** First-turn brief: don't interview, build. */
const FIRST_TURN_BRIEF =
  'The user wants results, not questions. Do NOT interview the user or wait for confirmations ' +
  '— start the full html-motion-video workflow immediately (recon, direction, storyboard, VO, ' +
  'build, mix, render). Make every creative decision yourself, grounded in recon evidence, and ' +
  'briefly narrate your choices as you go. Only stop early if a hard requirement is missing ' +
  '(e.g. you cannot access the product at all).'

/** Project names double as directory names — keep path traversal out. */
function isValidProjectName(name: string): boolean {
  return /^[^/\\]+$/.test(name) && name !== '..' && name !== '.' && !name.startsWith('.')
}

// --- SSE fan-out: one opencode event stream, many browser listeners ---------

interface SseClient {
  sessionId: string
  send: (ev: OpencodeEvent) => void
}
const sseClients = new Set<SseClient>()
let pumpStarted = false

async function startEventPump(): Promise<void> {
  if (pumpStarted) return
  pumpStarted = true
  try {
    const stream = await eventStream()
    for await (const ev of stream) {
      const sid = eventSessionId(ev)
      for (const c of sseClients) {
        if (!sid || sid === c.sessionId) c.send(ev)
      }
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
    res.json(await listProjects(userId))
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
    const project = await getProject(userId, req.params.name)
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
  if (!text) return res.status(400).json({ error: 'text is required' })

  try {
    const internal = toInternalName(userId, name)
    const project = await getProject(userId, name)
    let system = project
      ? `The video project lives in projects/${internal}/ (renders go to renders/ with the ${internal}- prefix). `
      : `Create a new video project under projects/${internal}/ following the html-motion-video skill conventions (renders go to renders/ with the ${internal}- prefix). `
    if (music) {
      system +=
        `Background music: the user picked "music/${music}" from the shared music library — ` +
        `copy it into the project's audio/ folder and use it as the music bed in the mix. `
    }

    const { id: sessionId } = await getSessionForProject(userId, name)
    const isFirstMessage = (await getMessages(sessionId)).length === 0
    if (isFirstMessage) {
      system += FIRST_TURN_BRIEF
    }
    await prompt(sessionId, text, system)
    res.json({ sessionId })
  } catch (error: any) {
    logger.error({ err: error, userId, project: name }, 'Failed to send launch-video prompt')
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

router.get('/projects/:name/events', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  if (!isValidProjectName(req.params.name)) {
    return res.status(400).json({ error: 'invalid project name' })
  }

  try {
    const { id: sessionId } = await getSessionForProject(userId, req.params.name)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(`data: ${JSON.stringify({ type: 'session', properties: { sessionId } })}\n\n`)

    const client: SseClient = {
      sessionId,
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
