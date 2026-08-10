/**
 * Launch Video state store — React port of the SolidJS store.ts.
 * A single context provider owns all state, the SSE connection, and the
 * streaming-message patch logic (optimistic user messages, part deltas,
 * tool/reasoning activity lines).
 */
import { useAuth } from '@clerk/react'
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type ChatMessage,
  type LaunchProjectDetail,
  type LaunchProjectInfo,
  launchApi,
  type MusicTrack,
  messageText,
  rawText,
  resolveFileUrl,
  type StudioEvent,
} from './api'

export type LaunchView = 'create' | 'edit'

export interface LaunchVideoStore {
  view: LaunchView
  setView: (v: LaunchView) => void
  projects: LaunchProjectInfo[]
  projectsLoading: boolean
  projectsError: boolean
  currentProject: LaunchProjectDetail | null
  selectedScene: string | null
  setSelectedScene: (id: string | null) => void
  /** All session messages (create phase chat). */
  messages: ChatMessage[]
  /**
   * Per-scene conversation threads. Keys are sceneId strings.
   * Only populated for scenes that have been edited via sendScenePrompt.
   */
  sceneMessages: ReadonlyMap<string, ChatMessage[]>
  busy: boolean
  sessionId: string | null
  musicTracks: MusicTrack[]
  /** file name of the chosen music bed, e.g. "main-theme.mp3" */
  selectedMusic: string | null
  setSelectedMusic: (file: string | null) => void
  /** Bumped whenever a render finishes so <video> reloads with a cache-busting URL. */
  videoVersion: number
  /** Current playback position of the editor player, in seconds. */
  playhead: number
  setPlayhead: (t: number) => void
  /** Current tool activity, shown instead of a dead "working…" bubble. */
  activity: string | null
  playerRef: RefObject<HTMLVideoElement | null>
  seekPlayer: (seconds: number) => void
  refreshProjects: () => Promise<void>
  refreshMusic: () => Promise<void>
  selectProject: (name: string) => Promise<void>
  clearProject: () => void
  startProject: (text: string) => Promise<{ jobId: string; projectName: string }>
  sendPrompt: (text: string) => Promise<void>
  sendScenePrompt: (sceneId: string, text: string) => Promise<void>
  /**
   * Resolve an API file path to an absolute URL with the Clerk token appended
   * as ?token= so <video>/<img> elements can fetch auth-gated media.
   * Returns null if path is falsy or no token is available yet.
   */
  mediaUrl: (path: string | null | undefined, version?: number) => string | null
  /** Job ID of the in-flight launch-video creation, if any. */
  currentJobId: string | null
  /** Error message for the in-flight launch-video creation job, if it failed. */
  jobError: string | null
  /** Resume tracking a launch-video job from a shared URL or refresh. */
  trackJob: (jobId: string) => Promise<void>
}

const LaunchVideoContext = createContext<LaunchVideoStore | null>(null)

export function useLaunchVideo(): LaunchVideoStore {
  const ctx = useContext(LaunchVideoContext)
  if (!ctx) throw new Error('useLaunchVideo must be used inside <LaunchVideoProvider>')
  return ctx
}

// --- Message helpers (ported from the SolidJS store) -------------------------

function toChatMessages(
  raw: Array<{
    info: { id: string; role: string; time?: { created: number } }
    parts: Array<{ id: string; type: string; text?: string }>
  }>,
): ChatMessage[] {
  return raw
    .filter(m => m.info.role === 'user' || m.info.role === 'assistant')
    .map(m => {
      const partTexts: Record<string, string> = {}
      for (const p of m.parts) {
        if (p.type === 'text' && p.text) partTexts[p.id] = p.text
      }
      return {
        id: m.info.id,
        role: m.info.role as 'user' | 'assistant',
        partTexts,
        created: m.info.time?.created ?? Date.now(),
      }
    })
    .filter(m => messageText(m).length > 0)
}

function patchWithin(
  prev: ChatMessage[],
  messageId: string,
  partId: string,
  text: string,
  roleFor: (messageId: string) => ChatMessage['role'],
): ChatMessage[] {
  const idx = prev.findIndex(m => m.id === messageId)
  if (idx !== -1) {
    const next = prev.slice()
    next[idx] = { ...next[idx], partTexts: { ...next[idx].partTexts, [partId]: text } }
    return next
  }
  const role = roleFor(messageId)
  if (role === 'user') {
    // The server-side copy of an optimistic local message — adopt, don't duplicate.
    const localIdx = prev.findIndex(m => m.id.startsWith('local-') && rawText(m) === text)
    if (localIdx !== -1) {
      const next = prev.slice()
      next[localIdx] = {
        id: messageId,
        role: 'user',
        partTexts: { [partId]: text },
        created: next[localIdx].created,
      }
      return next
    }
  }
  return [...prev, { id: messageId, role, partTexts: { [partId]: text }, created: Date.now() }]
}

let localMsgId = 0
function optimisticUserMessage(text: string): ChatMessage {
  return {
    id: `local-${++localMsgId}`,
    role: 'user',
    partTexts: { local: text },
    created: Date.now(),
  }
}

function errorMessage(text: string): ChatMessage {
  return {
    id: `local-${++localMsgId}`,
    role: 'assistant',
    partTexts: { local: text },
    created: Date.now(),
  }
}

// --- Provider ------------------------------------------------------------------

export function LaunchVideoProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()

  const [view, setView] = useState<LaunchView>('create')
  const [projects, setProjects] = useState<LaunchProjectInfo[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState(false)
  const [currentProject, setCurrentProject] = useState<LaunchProjectDetail | null>(null)
  const [selectedScene, setSelectedScene] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** sceneId -> chat messages for that scene's edit thread */
  const [sceneMessages, setSceneMessages] = useState<Map<string, ChatMessage[]>>(new Map())
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([])
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null)
  const [videoVersion, setVideoVersion] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [activity, setActivity] = useState<string | null>(null)
  /** Cached Clerk token for use in <video>/<img> ?token= URLs. Refreshed lazily. */
  const [mediaToken, setMediaToken] = useState<string | null>(null)
  /** Job ID of the in-flight launch-video creation job. */
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  /** Error message for the in-flight launch-video creation job, if it failed. */
  const [jobError, setJobError] = useState<string | null>(null)

  /** Registered by VideoPlayer so the timeline can seek it. */
  const playerRef = useRef<HTMLVideoElement | null>(null)

  const eventsRef = useRef<EventSource | null>(null)
  const eventsGenRef = useRef(0)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jobPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentNameRef = useRef<string | null>(null)
  /** partId -> part type, learned from message.part.updated; used to hide reasoning streams */
  const partTypesRef = useRef(new Map<string, string>())
  /** messageId -> role, learned from message.updated; avoids echoing the user's own message */
  const messageRolesRef = useRef(new Map<string, string>())
  /** messageId -> sceneId: routes SSE deltas for scene-edit replies to the right scene bucket */
  const messageSceneRef = useRef(new Map<string, string>())
  // Mirrors of state needed inside stable callbacks
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const selectedMusicRef = useRef(selectedMusic)
  selectedMusicRef.current = selectedMusic
  const sessionIdRef = useRef(sessionId)

  // Keep a fresh media token available for <video>/<img> src URLs.
  useEffect(() => {
    let cancelled = false
    void getToken().then(t => {
      if (!cancelled && t) setMediaToken(t)
    })
    return () => {
      cancelled = true
    }
  }, [getToken, sessionId]) // re-fetch when session changes (i.e. new project starts)
  sessionIdRef.current = sessionId
  const viewRef = useRef(view)
  viewRef.current = view
  const currentProjectRef = useRef(currentProject)
  currentProjectRef.current = currentProject
  const currentJobIdRef = useRef(currentJobId)
  currentJobIdRef.current = currentJobId

  const seekPlayer = useCallback((seconds: number) => {
    if (!playerRef.current) return
    playerRef.current.currentTime = seconds
    void playerRef.current.play()
  }, [])

  // --- Data fetching ----------------------------------------------------------

  const refreshProjects = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) throw new Error('no token')
      const list = await launchApi.listProjects(token)
      setProjects(list)
      setProjectsError(false)
    } catch {
      setProjectsError(true)
    } finally {
      setProjectsLoading(false)
    }
  }, [getToken])

  const refreshMusic = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      setMusicTracks(await launchApi.getMusic(token).catch(() => []))
    } catch {
      // music is optional — stay silent
    }
  }, [getToken])

  const refreshCurrentProject = useCallback(async () => {
    if (currentJobIdRef.current) return
    const name = currentNameRef.current
    if (!name) return
    try {
      const token = await getToken()
      if (!token) return
      const detail = await launchApi.getProject(token, name).catch(() => null)
      if (detail && currentNameRef.current === name) setCurrentProject(detail)
    } catch {
      // keep stale detail
    }
  }, [getToken])

  const refreshMessages = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const token = await getToken()
      if (!token) return
      const chat = toChatMessages(await launchApi.getMessages(token, sid))
      // Never clobber non-empty local state (e.g. an optimistic prompt the
      // session hasn't persisted yet) with an empty fetch.
      setMessages(prev => (chat.length > 0 || prev.length === 0 ? chat : prev))
    } catch {
      // keep local state
    }
  }, [getToken])

  // --- SSE handling -------------------------------------------------------------

  /** Patch a message into the correct bucket: scene thread or global list. */
  const patchMessage = useCallback(
    (messageId: string, partId: string, text: string, append: boolean) => {
      const sceneId = messageSceneRef.current.get(messageId)
      const roleFor = (id: string): ChatMessage['role'] =>
        messageRolesRef.current.get(id) === 'user' ? 'user' : 'assistant'

      if (sceneId) {
        setSceneMessages(prev => {
          const bucket = prev.get(sceneId) ?? []
          const idx = bucket.findIndex(m => m.id === messageId)
          let next: ChatMessage[]
          if (append) {
            const existing = idx === -1 ? '' : (bucket[idx].partTexts[partId] ?? '')
            next = patchWithin(bucket, messageId, partId, existing + text, roleFor)
          } else {
            next = patchWithin(bucket, messageId, partId, text, roleFor)
          }
          const m = new Map(prev)
          m.set(sceneId, next)
          return m
        })
      } else {
        if (append) {
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === messageId)
            const existing = idx === -1 ? '' : (prev[idx].partTexts[partId] ?? '')
            return patchWithin(prev, messageId, partId, existing + text, roleFor)
          })
        } else {
          setMessages(prev => patchWithin(prev, messageId, partId, text, roleFor))
        }
      }
    },
    [],
  )

  const patchStreamPart = useCallback(
    (messageId: string, partId: string, text: string) =>
      patchMessage(messageId, partId, text, false),
    [patchMessage],
  )

  const appendStreamDelta = useCallback(
    (messageId: string, partId: string, delta: string) =>
      patchMessage(messageId, partId, delta, true),
    [patchMessage],
  )

  const handleEvent = useCallback(
    (ev: StudioEvent) => {
      switch (ev.type) {
        case 'session':
          setSessionId(ev.properties?.sessionId ?? null)
          void refreshMessages()
          break
        case 'session.status':
        case 'session.idle':
          if (ev.type === 'session.status') {
            setBusy(ev.properties?.status?.type === 'busy')
          } else if (ev.type === 'session.idle') {
            if (!currentJobIdRef.current) {
              setBusy(false)
              setActivity(null)
              void (async () => {
                void refreshMessages()
                void refreshProjects()
                const hadVideo = !!currentProjectRef.current?.videoUrl
                const prevUrl = currentProjectRef.current?.videoUrl ?? null
                await refreshCurrentProject()
                // First render just landed — jump to the scene editor.
                if (
                  !hadVideo &&
                  currentProjectRef.current?.videoUrl &&
                  viewRef.current === 'create'
                ) {
                  setView('edit')
                }
                // Poll for updated render: the agent writes the file then goes idle;
                // the file might not be flushed yet. Poll /scenes up to ~20s.
                if (renderPollRef.current) clearTimeout(renderPollRef.current)
                let attempts = 0
                const pollRender = async () => {
                  if (attempts++ > 10 || !currentNameRef.current) return
                  const tok = await getToken().catch(() => null)
                  if (!tok) return
                  const detail = await launchApi
                    .getProject(tok, currentNameRef.current)
                    .catch(() => null)
                  if (!detail) return
                  const newUrl = detail.videoUrl
                  if (newUrl && newUrl !== prevUrl) {
                    setCurrentProject(detail)
                    setVideoVersion(v => v + 1)
                  } else {
                    renderPollRef.current = setTimeout(() => void pollRender(), 2000)
                  }
                }
                void pollRender()
              })()
            }
          }
          break
        case 'message.part.delta': {
          setBusy(true)
          // True streaming: append incremental text deltas (skip reasoning).
          const p = ev.properties
          if (
            p?.partID &&
            partTypesRef.current.get(p.partID) &&
            partTypesRef.current.get(p.partID) !== 'text'
          ) {
            break
          }
          if (p?.field === 'text' && p.messageID && p.partID && typeof p.delta === 'string') {
            setActivity(null)
            appendStreamDelta(p.messageID, p.partID, p.delta)
          }
          break
        }
        case 'message.part.updated': {
          setBusy(true)
          // Track part types so deltas for reasoning/tool parts can be hidden.
          const part = ev.properties?.part
          if (part?.id && part.type) partTypesRef.current.set(part.id, part.type)
          if (part?.type === 'text' && part.messageID && part.id) {
            if (part.text) setActivity(null)
            patchStreamPart(part.messageID, part.id, part.text ?? '')
          } else if (part?.type === 'tool') {
            // Long tool phases (recon, TTS, render) stream no text — show activity.
            const name = part.tool ?? part.name ?? 'tool'
            setActivity(`Running ${name}…`)
          } else if (part?.type === 'patch') {
            setActivity('Editing project files…')
          } else if (part?.type === 'reasoning' && typeof part.text === 'string' && part.text) {
            // Surface the latest reasoning line as a live status.
            const line = part.text
              .replace(/\*\*/g, '')
              .split('\n')
              .find((l: string) => l.trim().length > 0)
            if (line) setActivity(line.trim().slice(0, 90))
          }
          break
        }
        case 'message.updated': {
          setBusy(true)
          // Learn message roles so user parts don't echo as assistant bubbles.
          const info = ev.properties?.message ?? ev.properties?.info
          if (info?.id && info.role) messageRolesRef.current.set(info.id, info.role)
          // When the server echoes back the user message that was optimistically
          // added by sendScenePrompt, adopt the real ID into messageSceneRef.
          if (info?.id && info.role === 'user') {
            // The optimistic message has the sceneId in its text: "[sceneId] ..."
            // We propagate via pendingSceneRef which sendScenePrompt sets.
            const pending = pendingSceneRef.current
            if (pending) {
              messageSceneRef.current.set(info.id, pending)
            }
          }
          break
        }
        case 'session.error':
          setBusy(false)
          setActivity(null)
          break
      }
    },
    [
      appendStreamDelta,
      getToken,
      patchStreamPart,
      refreshCurrentProject,
      refreshMessages,
      refreshProjects,
    ],
  )
  const handleEventRef = useRef(handleEvent)
  handleEventRef.current = handleEvent

  const connectEvents = useCallback(
    async (name: string) => {
      const gen = ++eventsGenRef.current
      if (retryRef.current) clearTimeout(retryRef.current)
      eventsRef.current?.close()
      eventsRef.current = null
      // Always fetch a fresh token so the SSE URL never carries an expired JWT
      const token = await getToken()
      if (!token || gen !== eventsGenRef.current) return
      const es = new EventSource(launchApi.eventsUrl(name, token))
      es.onmessage = msg => {
        try {
          handleEventRef.current(JSON.parse(msg.data) as StudioEvent)
        } catch {
          // ignore malformed events / keepalive lines
        }
      }
      es.onerror = () => {
        es.close()
        if (gen === eventsGenRef.current && currentNameRef.current === name) {
          // Reconnect after 3 s with a brand-new token (same pattern as /jobs/stream)
          retryRef.current = setTimeout(() => void connectEvents(name), 3000)
        }
      }
      eventsRef.current = es
    },
    [getToken],
  )

  // --- Actions ------------------------------------------------------------------

  /**
   * Tracks which sceneId the *next* agent reply belongs to.
   * Set by sendScenePrompt before the API call; cleared after the user message
   * is echoed back with a real server ID.
   */
  const pendingSceneRef = useRef<string | null>(null)

  const selectProject = useCallback(
    async (name: string, opts?: { skipFetch?: boolean }) => {
      currentNameRef.current = name
      setSelectedScene(null)
      setMessages([])
      setSceneMessages(new Map())
      setSessionId(null)
      setBusy(false)
      setActivity(null)
      partTypesRef.current.clear()
      messageRolesRef.current.clear()
      messageSceneRef.current.clear()
      pendingSceneRef.current = null

      void connectEvents(name)

      let detail: LaunchProjectDetail | null = null
      if (!opts?.skipFetch) {
        try {
          const token = await getToken()
          if (token) detail = await launchApi.getProject(token, name).catch(() => null)
        } catch {
          detail = null
        }
      }
      if (currentNameRef.current !== name) return
      setCurrentProject(detail ?? { name, duration: 0, videoUrl: null, scenes: [] })
    },
    [connectEvents, getToken],
  )

  /** Leave the current project and return to the picker. */
  const clearProject = useCallback(() => {
    eventsGenRef.current++
    if (retryRef.current) clearTimeout(retryRef.current)
    if (renderPollRef.current) clearTimeout(renderPollRef.current)
    if (jobPollRef.current) clearTimeout(jobPollRef.current)
    eventsRef.current?.close()
    eventsRef.current = null
    currentNameRef.current = null
    setCurrentProject(null)
    setSelectedScene(null)
    setMessages([])
    setSceneMessages(new Map())
    setSessionId(null)
    setBusy(false)
    setActivity(null)
    setPlayhead(0)
    setCurrentJobId(null)
    setJobError(null)
    playerRef.current = null
    messageSceneRef.current.clear()
    pendingSceneRef.current = null
  }, [])

  /** Generate a project slug from the prompt text, unique against existing projects.
   *  Strips URL protocols and common TLD noise so a prompt like
   *  "generate second video https://example.com" doesn't become "generate-second-video-https". */
  const slugFromPrompt = (text: string): string => {
    const cleaned = text
      .toLowerCase()
      .replace(/\bhttps?:\/\//g, ' ')
      .replace(/\bwww\./g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
    const noise = new Set(['http', 'https', 'www', 'com'])
    const words = cleaned
      .split(/\s+/)
      .filter(w => w.length > 2 && !noise.has(w))
      .slice(0, 4)
    const base = words.join('-') || 'video'
    const taken = new Set(projectsRef.current.map(p => p.name))
    if (!taken.has(base)) return base
    for (let i = 2; ; i++) {
      if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
    }
  }

  /** Create (and select) a new project named after the prompt.
   *  Instead of fetching /scenes immediately (which 404s until the worker has
   *  created the project), this queues a launch-video job and tracks it by
   *  jobId. The caller should navigate to /launch-video/job/:jobId. */
  const startProject = useCallback(
    async (text: string) => {
      const name = slugFromPrompt(text)
      // Connect the SSE stream early so live agent messages stream in; skip the
      // scenes fetch because the project directory isn't ready yet.
      await selectProject(name, { skipFetch: true })
      setBusy(true)
      setMessages(m => [...m, optimisticUserMessage(text)])
      setJobError(null)
      try {
        const token = await getToken()
        if (!token) throw new Error('no token')
        const { jobId } = await launchApi.sendPrompt(
          token,
          name,
          text,
          selectedMusicRef.current ?? undefined,
        )
        setCurrentJobId(jobId)
        return { jobId, projectName: name }
      } catch (err: any) {
        setBusy(false)
        const msg = err?.message ?? 'Something went wrong — please try again.'
        setJobError(msg)
        setMessages(m => [...m, errorMessage(msg)])
        throw err
      }
    },
    [getToken, selectProject],
  )

  /** Resume tracking a launch-video job (e.g. after a refresh on
   *  /launch-video/job/:jobId). Fetches the job row, reconnects the SSE stream,
   *  and starts polling until the job finishes. */
  const trackJob = useCallback(
    async (jobId: string) => {
      setCurrentJobId(jobId)
      setJobError(null)
      try {
        const token = await getToken()
        if (!token) throw new Error('no token')
        const job = await launchApi.getJob(token, jobId)
        const projectName = (job.parameters as any)?.projectName as string | undefined
        if (projectName) {
          currentNameRef.current = projectName
          await selectProject(projectName, { skipFetch: job.status !== 'COMPLETED' })
        }
        if (job.status === 'COMPLETED') {
          setCurrentJobId(null)
          setBusy(false)
        } else if (job.status === 'FAILED') {
          setCurrentJobId(null)
          setBusy(false)
          const msg = job.error ?? 'Launch video generation failed'
          setJobError(msg)
          setMessages(m => [...m, errorMessage(msg)])
        }
      } catch (err: any) {
        const msg = err?.message ?? 'Failed to load job'
        setJobError(msg)
      }
    },
    [getToken, selectProject],
  )

  // Poll the job row while a launch-video creation job is in flight.
  useEffect(() => {
    if (!currentJobId) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const token = await getToken()
        if (!token) return
        const job = await launchApi.getJob(token, currentJobId)
        if (cancelled) return
        const projectName = (job.parameters as any)?.projectName as string | undefined
        if (job.status === 'COMPLETED') {
          setCurrentJobId(null)
          setBusy(false)
          if (projectName) {
            currentNameRef.current = projectName
            await selectProject(projectName)
          }
        } else if (job.status === 'FAILED') {
          setCurrentJobId(null)
          setBusy(false)
          const msg = job.error ?? 'Launch video generation failed'
          setJobError(msg)
          setMessages(m => [...m, errorMessage(msg)])
        } else {
          jobPollRef.current = setTimeout(() => void poll(), 3000)
        }
      } catch {
        // Keep polling through transient errors; the SSE still shows progress.
        jobPollRef.current = setTimeout(() => void poll(), 3000)
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (jobPollRef.current) clearTimeout(jobPollRef.current)
    }
  }, [currentJobId, getToken, selectProject])

  const sendPrompt = useCallback(
    async (text: string) => {
      const name = currentNameRef.current
      if (!name) return
      setBusy(true)
      setMessages(m => [...m, optimisticUserMessage(text)])
      try {
        const token = await getToken()
        if (!token) throw new Error('no token')
        await launchApi.sendPrompt(token, name, text, selectedMusicRef.current ?? undefined)
      } catch {
        setBusy(false)
        setMessages(m => [
          ...m,
          errorMessage('Something went wrong sending that — please try again.'),
        ])
      }
    },
    [getToken],
  )

  const sendScenePrompt = useCallback(
    async (sceneId: string, text: string) => {
      const name = currentNameRef.current
      if (!name) return
      setBusy(true)
      // Optimistically add the user bubble to this scene's thread.
      const optimistic = optimisticUserMessage(text)
      setSceneMessages(prev => {
        const bucket = prev.get(sceneId) ?? []
        const m = new Map(prev)
        m.set(sceneId, [...bucket, optimistic])
        return m
      })
      // Mark which scene the next agent response belongs to.
      pendingSceneRef.current = sceneId
      // Any message the server echoes back for this round gets routed to sceneId.
      // We learn the real message ID from the message.updated SSE event.
      messageSceneRef.current.set(optimistic.id, sceneId)
      try {
        const token = await getToken()
        if (!token) throw new Error('no token')
        await launchApi.sendScenePrompt(token, name, sceneId, text)
      } catch {
        setBusy(false)
        pendingSceneRef.current = null
        setSceneMessages(prev => {
          const bucket = prev.get(sceneId) ?? []
          const m = new Map(prev)
          m.set(sceneId, [...bucket, errorMessage('Something went wrong — please try again.')])
          return m
        })
      }
    },
    [getToken],
  )

  const mediaUrl = useCallback(
    (path: string | null | undefined, version?: number): string | null => {
      const resolved = resolveFileUrl(path)
      if (!resolved || !mediaToken) return null
      const tok = encodeURIComponent(mediaToken)
      const url =
        version !== undefined ? `${resolved}?v=${version}&token=${tok}` : `${resolved}?token=${tok}`
      return url
    },
    [mediaToken],
  )

  // Initial load + teardown of the SSE connection
  useEffect(() => {
    void refreshProjects()
    void refreshMusic()
    return () => {
      eventsGenRef.current++
      if (retryRef.current) clearTimeout(retryRef.current)
      if (renderPollRef.current) clearTimeout(renderPollRef.current)
      if (jobPollRef.current) clearTimeout(jobPollRef.current)
      eventsRef.current?.close()
      eventsRef.current = null
    }
  }, [refreshProjects, refreshMusic])

  const value = useMemo<LaunchVideoStore>(
    () => ({
      view,
      setView,
      projects,
      projectsLoading,
      projectsError,
      currentProject,
      selectedScene,
      setSelectedScene,
      messages,
      sceneMessages,
      busy,
      sessionId,
      musicTracks,
      selectedMusic,
      setSelectedMusic,
      videoVersion,
      playhead,
      setPlayhead,
      activity,
      playerRef,
      seekPlayer,
      refreshProjects,
      refreshMusic,
      selectProject,
      clearProject,
      startProject,
      sendPrompt,
      sendScenePrompt,
      mediaUrl,
      currentJobId,
      jobError,
      trackJob,
    }),
    [
      view,
      projects,
      projectsLoading,
      projectsError,
      currentProject,
      selectedScene,
      messages,
      sceneMessages,
      busy,
      sessionId,
      musicTracks,
      selectedMusic,
      videoVersion,
      playhead,
      activity,
      seekPlayer,
      refreshProjects,
      refreshMusic,
      selectProject,
      clearProject,
      startProject,
      sendPrompt,
      sendScenePrompt,
      mediaUrl,
      currentJobId,
      jobError,
      trackJob,
    ],
  )

  return <LaunchVideoContext.Provider value={value}>{children}</LaunchVideoContext.Provider>
}
