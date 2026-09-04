/**
 * One open project: its detail (preview description, outputs), the agent
 * thread streamed over SSE, targets picked in the preview, the playhead and
 * export state. Everything the StudioView and its preview renderers need.
 */
import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Asset,
  mediaUrl as buildMediaUrl,
  type Entry,
  type ExportStatus,
  type ProjectDetail,
  type StudioEvent,
  studio,
  type UploadRef,
} from './client'

export interface SelectedElement {
  sceneId: string | null
  slide?: number | null
  shotType?: string | null
  tagName: string
  className: string
  id: string
  text: string
  selector: string
  html?: string
  mark?: number
  /** Seconds into a video — set when the target is a moment or a range, not a DOM node. */
  time?: number
  /** End of a selected range, in seconds. Absent for a single moment. */
  endTime?: number
  /**
   * Workspace-relative path — set when the target is a FILE on the shelf
   * rather than something on the artifact. It is the same string the agent's
   * tools take, so pointing at it in the UI and naming it in a tool call are
   * the same act.
   */
  asset?: string
  /** How the file got here: the user added it, or the studio made it. */
  assetOrigin?: string
}

export interface Target extends SelectedElement {
  ref: number
}

/** Prefix the user's text with a legend describing every referenced target. */
export function withTargetLegend(text: string, list: Target[]): string {
  if (list.length === 0) return text
  const lines = list.map(t => {
    // A file on the shelf is addressed by its path, which is what a tool takes.
    if (t.asset)
      return [`[${t.ref}] the file ${t.asset}`, t.text ? `"${t.text}"` : null]
        .filter(Boolean)
        .join(' · ')
    // A moment or a range in a video has no DOM node — address it by time.
    if (typeof t.time === 'number') {
      const where =
        typeof t.endTime === 'number' && t.endTime > t.time
          ? `the range ${t.time.toFixed(1)}s–${t.endTime.toFixed(1)}s (${(t.endTime - t.time).toFixed(1)}s long)`
          : `the moment at ${t.time.toFixed(1)}s`
      return [
        `[${t.ref}] ${where}`,
        t.sceneId ? `in ${t.sceneId}` : null,
        t.text ? `"${t.text}"` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    const attrs = (t.className ? ` class="${t.className}"` : '') + (t.id ? ` id="${t.id}"` : '')
    return [
      `[${t.ref}] <${t.tagName}${attrs}>`,
      t.sceneId
        ? `in ${t.slide ? `slide ${t.slide}` : `scene ${t.sceneId}`}${t.shotType ? ` (type ${t.shotType})` : ''}`
        : 'in the active view',
      t.text ? `text "${t.text}"` : null,
      `selector: ${t.selector}`,
    ]
      .filter(Boolean)
      .join(' · ')
  })
  return `Target elements (referenced below as [n]):\n${lines.join('\n')}\n\n${text}`
}

function toolPhase(tool: string): string {
  switch (tool) {
    case 'motion_screenshot':
    case 'motion_recon':
      return "Studying the product's brand…"
    case 'motion_harvest':
      return "Collecting the product's own logo and screens…"
    case 'motion_check':
    case 'motion_cues':
      return 'Checking the cut…'
    case 'motion_align':
    case 'motion_sync':
      return 'Cutting the picture to the words…'
    case 'motion_sfx':
    case 'motion_mix':
      return 'Mixing the sound…'
    case 'motion_find_audio':
      return 'Picking a music bed…'
    case 'motion_tts':
      return 'Recording voiceover…'
    case 'motion_audit':
      return 'Auditing motion quality…'
    case 'motion_render':
    case 'demo_render':
    case 'edit_render':
      return 'Rendering the video…'
    case 'demo_record_start':
      return 'Opening the browser…'
    case 'demo_narrate':
      return 'Narrating…'
    case 'demo_bash':
    case 'demo_fill_field':
    case 'demo_zoom_in':
    case 'demo_zoom_out':
      return 'Driving the product…'
    case 'pdf_scaffold':
    case 'pdf_build':
    case 'deck_render':
      return 'Building slides…'
    case 'pdf_scrape_images':
      return 'Fetching images…'
    case 'deck_publish':
      return 'Publishing the deck…'
    case 'transcribe_video':
    case 'detect_key_moments':
    case 'inspect_frames':
      return 'Studying the recording…'
    case 'write':
    case 'edit':
      return 'Writing…'
    case 'bash':
      return 'Working in the studio…'
    default:
      return 'Thinking…'
  }
}

/** One-line "what is the agent doing right now", derived from the newest entries. */
export function buildStatus(entries: Entry[], previewNote: string | null): string {
  if (previewNote) return `preview is not loading yet — ${previewNote}`
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.role === 'tool' && e.tool?.status === 'running') return toolPhase(e.tool.name)
    if ((e.role === 'assistant' || e.role === 'thinking') && e.text.trim()) {
      const lines = e.text
        .trim()
        .split('\n')
        .filter(l => l.trim())
      return lines[lines.length - 1].replace(/\*\*/g, '').slice(0, 120)
    }
  }
  return 'Warming up…'
}

export interface PlayerCtrl {
  seek(seconds: number): void
}

let localId = 0

export function useProject(id: string | undefined) {
  const { getToken: clerkGetToken } = useAuth()
  const getToken = useCallback(async () => {
    const t = await clerkGetToken()
    if (!t) throw new Error('Not signed in')
    return t
  }, [clerkGetToken])

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [videoVersion, setVideoVersion] = useState(0)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const [liveCount, setLiveCount] = useState<number | null>(null)
  const [selectedScene, setSelectedScene] = useState<string | null>(null)
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [inspectMode, setInspectMode] = useState(false)
  const [draft, setDraftState] = useState('')
  const [playhead, setPlayhead] = useState(0)
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null)
  const [mediaToken, setMediaToken] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])

  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const player = useRef<PlayerCtrl | null>(null)
  const nextRef = useRef(1)
  const idRef = useRef<string | undefined>(id)
  const projectRef = useRef<ProjectDetail | null>(null)
  const busyRef = useRef(false)
  const playheadRef = useRef(0)
  const playingRef = useRef(false)
  const autoSeek = useRef<{ t: number; play: boolean } | null>(null)
  const eventsRef = useRef<EventSource | null>(null)
  const gen = useRef(0)
  const exportPoll = useRef(0)

  useEffect(() => {
    projectRef.current = project
  }, [project])
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])

  useEffect(() => {
    let live = true
    const refresh = () =>
      void getToken()
        .then(t => live && setMediaToken(t))
        .catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 45_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [getToken])

  const mediaUrl = useCallback(
    (path: string | null | undefined, version?: number) => buildMediaUrl(path, mediaToken, version),
    [mediaToken],
  )
  const thumbnailUrl = useCallback(
    (t: number) => (id && mediaToken ? studio.thumbnailUrl(id, t, mediaToken, videoVersion) : null),
    [id, mediaToken, videoVersion],
  )

  const refresh = useCallback(async () => {
    const pid = idRef.current
    if (!pid) return null
    try {
      const detail = await studio.get(await getToken(), pid)
      if (idRef.current === pid) setProject(detail)
      return detail
    } catch (err: any) {
      if (idRef.current === pid)
        setLoadError(
          err?.status === 404
            ? 'This project no longer exists.'
            : (err?.message ?? 'Could not load the project'),
        )
      return null
    }
  }, [getToken])

  /**
   * The shelf is derived from the workspace, so it is re-read rather than
   * mutated: the agent adds to it (a generated clip, a harvested logo) without
   * going through the client.
   */
  const refreshAssets = useCallback(async () => {
    const pid = idRef.current
    if (!pid) return
    try {
      const list = await studio.assets(await getToken(), pid)
      if (idRef.current === pid) setAssets(list)
    } catch {
      /* the shelf is an aid, not the artifact — a failed listing is not an error */
    }
  }, [getToken])

  const addAssets = useCallback(
    async (files: FileList | File[]) => {
      const pid = idRef.current
      const picked = Array.from(files)
      if (!pid || !picked.length) return
      const token = await getToken()
      const form = new FormData()
      for (const f of picked) form.append('files', f)
      const uploaded = await studio.upload(token, form)
      await studio.addAssets(token, pid, uploaded)
      await refreshAssets()
    },
    [getToken, refreshAssets],
  )

  // A relevant file changed in the workspace: re-read the description and
  // reload the preview, landing on whatever is new.
  const onPreviewChanged = useCallback(async () => {
    const before = projectRef.current
    const detail = await refresh()
    if (!detail) return
    const beforeCount = before?.description.scenes?.length ?? 0
    const scenes = detail.description.scenes ?? []
    const firstNew = scenes[beforeCount]
    if (firstNew && before?.description.preview)
      autoSeek.current = { t: firstNew.start + 0.01, play: true }
    else if (firstNew) autoSeek.current = { t: 0, play: true }
    else autoSeek.current = { t: playheadRef.current, play: playingRef.current }
    setLiveCount(busyRef.current && scenes.length ? scenes.length : null)
    setVideoVersion(v => v + 1)
    void refreshAssets()
  }, [refresh, refreshAssets])

  const handleEvent = useCallback(
    (ev: StudioEvent) => {
      switch (ev.type) {
        case 'hello':
        case 'status':
          setBusy(ev.busy)
          break
        case 'entry':
          setEntries(prev => {
            if (ev.entry.role === 'user') {
              const i = prev.findIndex(e => e.id.startsWith('local-') && e.text === ev.entry.text)
              if (i !== -1) {
                const next = prev.slice()
                next[i] = ev.entry
                return next
              }
            }
            return [...prev, ev.entry]
          })
          break
        case 'delta':
          setEntries(prev => {
            const i = prev.findIndex(e => e.id === ev.id)
            if (i === -1) return prev
            const next = prev.slice()
            next[i] = { ...next[i], text: next[i].text + ev.delta }
            return next
          })
          break
        case 'update':
          setEntries(prev => prev.map(e => (e.id === ev.entry.id ? ev.entry : e)))
          break
        case 'idle':
          setBusy(false)
          setLiveCount(null)
          setVideoVersion(v => v + 1)
          void refresh()
          break
        case 'preview':
          if (!ev.ok) {
            setPreviewNote(ev.error ?? 'the preview does not load')
            break
          }
          setPreviewNote(null)
          void onPreviewChanged()
          break
        case 'project':
          setProject(prev =>
            prev ? { ...prev, ...ev.project, description: prev.description } : prev,
          )
          break
        case 'error':
          setBusy(false)
          setEntries(prev => [
            ...prev,
            { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${ev.message}` },
          ])
          break
        case 'deleted':
          setLoadError('This project was deleted.')
          break
      }
    },
    [onPreviewChanged, refresh],
  )

  const connect = useCallback(
    async (pid: string) => {
      const myGen = ++gen.current
      eventsRef.current?.close()
      let token: string
      try {
        token = await getToken()
      } catch {
        return
      }
      if (myGen !== gen.current) return
      const es = new EventSource(studio.eventsUrl(pid, token))
      es.onmessage = m => {
        try {
          handleEvent(JSON.parse(m.data))
        } catch {
          /* ignore */
        }
      }
      es.onerror = () => {
        es.close()
        if (myGen !== gen.current) return
        window.setTimeout(() => {
          if (myGen === gen.current && idRef.current === pid) void connect(pid)
        }, 2000)
      }
      eventsRef.current = es
    },
    [getToken, handleEvent],
  )

  // Open / close with the id.
  useEffect(() => {
    idRef.current = id
    gen.current++
    eventsRef.current?.close()
    eventsRef.current = null
    setProject(null)
    setLoadError(null)
    setEntries([])
    setBusy(false)
    setVideoVersion(0)
    setPreviewNote(null)
    setLiveCount(null)
    setSelectedScene(null)
    setSelectedSlide(null)
    setTargets([])
    targetsRef.current = []
    setAssets([])
    nextRef.current = 1
    setInspectMode(false)
    setDraftState('')
    setPlayhead(0)
    setExportStatus(null)
    autoSeek.current = null
    player.current = null
    window.clearInterval(exportPoll.current)
    if (!id) return
    void connect(id)
    void (async () => {
      const token = await getToken().catch(() => null)
      if (!token || idRef.current !== id) return
      const [detail, log, exp, shelf] = await Promise.all([
        studio.get(token, id).catch((err: any) => {
          setLoadError(
            err?.status === 404
              ? 'This project no longer exists.'
              : (err?.message ?? 'Could not load the project'),
          )
          return null
        }),
        studio.messages(token, id).catch(() => ({ entries: [] as Entry[], busy: false })),
        studio.getExport(token, id).catch(() => null),
        studio.assets(token, id).catch(() => [] as Asset[]),
      ])
      if (idRef.current !== id) return
      if (detail) setProject(detail)
      setAssets(shelf)
      setEntries(prev => (log.entries.length > 0 || prev.length === 0 ? log.entries : prev))
      setBusy(log.busy)
      if (exp) {
        setExportStatus(exp)
        if (exp.running) startExportPoll(id)
      }
    })()
    return () => {
      gen.current++
      eventsRef.current?.close()
      eventsRef.current = null
      window.clearInterval(exportPoll.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Targets ─────────────────────────────────────────────────────────────────

  const setDraft = useCallback(
    (v: string | ((d: string) => string)) =>
      setDraftState(prev => (typeof v === 'function' ? v(prev) : v)),
    [],
  )

  // Assigning the ref and appending its token are side effects, so they must
  // NOT live inside the setTargets updater: React invokes updaters twice in
  // development, which burned a second ref number and pushed a phantom "[2]"
  // into the prompt for every element the user picked.
  const targetsRef = useRef<Target[]>([])
  useEffect(() => {
    targetsRef.current = targets
  }, [targets])

  const addTarget = useCallback((el: SelectedElement) => {
    const dup = targetsRef.current.find(
      t => t.sceneId === el.sceneId && t.selector === el.selector && t.text === el.text,
    )
    const ref = dup ? dup.ref : nextRef.current++
    if (!dup) {
      const added = { ...el, ref }
      targetsRef.current = [...targetsRef.current, added]
      setTargets(targetsRef.current)
    }
    setDraftState(d => {
      const token = `[${ref}]`
      if (d.includes(token)) return d
      return `${d}${d && !/\s$/.test(d) ? ' ' : ''}${token} `
    })
    queueMicrotask(() => {
      const ta = composerRef.current
      if (!ta) return
      ta.focus()
      ta.selectionStart = ta.selectionEnd = ta.value.length
    })
  }, [])
  const removeTarget = useCallback((ref: number) => {
    targetsRef.current = targetsRef.current.filter(t => t.ref !== ref)
    setTargets(targetsRef.current)
  }, [])
  const clearTargets = useCallback(() => {
    targetsRef.current = []
    setTargets([])
    nextRef.current = 1
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const send = useCallback(
    async (text: string, opts: { uploads?: UploadRef[]; options?: Record<string, any> } = {}) => {
      const pid = idRef.current
      if (!pid || !text.trim()) return
      const list = targets
      const promptText = withTargetLegend(text.trim(), list)
      const scenes = new Set(list.map(t => t.sceneId).filter(Boolean) as string[])
      const slides = new Set(
        list.map(t => t.slide).filter((s): s is number => typeof s === 'number'),
      )
      const scene = list.length ? (scenes.size === 1 ? [...scenes][0] : null) : selectedScene
      const slide = list.length ? (slides.size === 1 ? [...slides][0] : null) : selectedSlide
      setDraftState('')
      clearTargets()
      setBusy(true)
      setEntries(e => [...e, { id: `local-${++localId}`, role: 'user', text: promptText }])
      try {
        await studio.prompt(await getToken(), pid, {
          text: promptText,
          targets: list,
          scene,
          slide,
          uploads: opts.uploads,
          options: opts.options,
        })
      } catch (err: any) {
        setBusy(false)
        const msg =
          err?.status === 409
            ? 'The agent is still working — wait for it to finish.'
            : (err?.message ?? 'Could not send')
        setEntries(e => [...e, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${msg}` }])
      }
    },
    [clearTargets, getToken, selectedScene, selectedSlide, targets],
  )

  const stop = useCallback(async () => {
    const pid = idRef.current
    if (!pid) return
    await studio.stop(await getToken(), pid).catch(() => {})
  }, [getToken])

  const remove = useCallback(async () => {
    const pid = idRef.current
    if (!pid) return
    await studio.remove(await getToken(), pid)
  }, [getToken])

  const share = useCallback(async () => {
    const pid = idRef.current
    if (!pid) return null
    const updated = await studio.share(await getToken(), pid)
    setProject(prev => (prev ? { ...prev, ...updated, description: prev.description } : prev))
    return updated.shareSlug ? `${window.location.origin}/d/${updated.shareSlug}` : null
  }, [getToken])

  const upload = useCallback(
    async (files: File[]) => {
      const form = new FormData()
      for (const f of files) form.append('files', f)
      return studio.upload(await getToken(), form)
    },
    [getToken],
  )

  const stopExportPoll = () => {
    window.clearInterval(exportPoll.current)
    exportPoll.current = 0
  }

  const download = useCallback(
    (url: string, label: string) => {
      const a = document.createElement('a')
      a.href = mediaUrl(url) ?? url
      a.download = label
      a.click()
    },
    [mediaUrl],
  )

  const pollExport = useCallback(
    async (pid: string) => {
      let st: ExportStatus | null = null
      try {
        st = await studio.getExport(await getToken(), pid)
      } catch {
        return
      }
      if (!st || idRef.current !== pid) return
      setExportStatus(st)
      if (!st.running) {
        stopExportPoll()
        if (st.stage === 'done') {
          await refresh()
          if (st.url)
            download(
              st.url,
              `${projectRef.current?.title ?? 'video'}${st.res ? `-${st.res}` : ''}.mp4`,
            )
        }
      }
    },
    [download, getToken, refresh],
  )

  function startExportPoll(pid: string) {
    stopExportPoll()
    exportPoll.current = window.setInterval(() => void pollExport(pid), 1000)
  }

  const exportVideo = useCallback(
    async (body: Record<string, any> = {}) => {
      const pid = idRef.current
      if (!pid) return
      try {
        const st = await studio.startExport(await getToken(), pid, body)
        setExportStatus(st)
        if (st.running) startExportPoll(pid)
        else if (st.stage === 'done' && st.url)
          download(
            st.url,
            `${projectRef.current?.title ?? 'export'}${st.res ? `-${st.res}` : ''}${/\.pdf($|\?)/.test(st.url) ? '.pdf' : '.mp4'}`,
          )
      } catch (err: any) {
        setExportStatus({
          running: false,
          res: body.res ?? null,
          url: null,
          progress: 0,
          stage: 'failed',
          error:
            err?.status === 402
              ? 'Not enough credits for this resolution'
              : String(err?.message ?? err),
          startedAt: null,
          finishedAt: null,
        })
      }
    },
    [download, getToken, pollExport],
  )

  const cancelExport = useCallback(async () => {
    const pid = idRef.current
    if (!pid) return
    await studio.cancelExport(await getToken(), pid).catch(() => {})
  }, [getToken])

  const seekPlayer = useCallback((t: number) => player.current?.seek(t), [])
  const consumeAutoSeek = useCallback(() => {
    const a = autoSeek.current
    autoSeek.current = null
    return a
  }, [])
  const notePlayerState = useCallback((playing: boolean) => {
    playingRef.current = playing
  }, [])

  const status = useMemo(() => buildStatus(entries, previewNote), [entries, previewNote])

  return {
    id,
    project,
    loadError,
    entries,
    busy,
    status,
    videoVersion,
    previewNote,
    liveCount,
    selectedScene,
    setSelectedScene,
    selectedSlide,
    setSelectedSlide,
    targets,
    addTarget,
    removeTarget,
    clearTargets,
    inspectMode,
    setInspectMode,
    draft,
    setDraft,
    composerRef,
    playhead,
    setPlayhead,
    player,
    seekPlayer,
    consumeAutoSeek,
    notePlayerState,
    exportStatus,
    exportVideo,
    cancelExport,
    send,
    stop,
    remove,
    share,
    upload,
    assets,
    refreshAssets,
    addAssets,
    refresh,
    mediaUrl,
    mediaToken,
    thumbnailUrl,
    getToken,
  }
}

export type ProjectStore = ReturnType<typeof useProject>
