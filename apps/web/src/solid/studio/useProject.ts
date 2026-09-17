import { batch, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { useAuth } from '../core/auth'
import { mediaUrl as buildMediaUrl, studio } from './client'
import { createExportRequest, exportFilename } from './editable-export'
import { buildStatus, withTargetLegend } from './helpers'
import { createPreviewCredential, createPreviewRefresh } from './preview-refresh'
import type {
  Asset,
  Entry,
  ExportStatus,
  PlayerCtrl,
  ProjectDetail,
  SelectedElement,
  StudioEvent,
  Target,
  UploadRef,
} from './types'

let localId = 0
export function useProject(id: string | undefined) {
  const auth = useAuth()
  const getToken = async () => {
    const token = await auth.getToken()
    if (!token) throw new Error('Not signed in')
    return token
  }
  const [project, setProject] = createSignal<ProjectDetail | null>(null),
    [loadError, setLoadError] = createSignal<string | null>(null)
  const [entries, setEntries] = createSignal<Entry[]>([]),
    [busy, setBusy] = createSignal(false),
    [activeModel, setActiveModel] = createSignal<string | null>(null),
    [videoVersion, setVideoVersion] = createSignal(0)
  const [previewNote, setPreviewNote] = createSignal<string | null>(null),
    [liveCount, setLiveCount] = createSignal<number | null>(null),
    [previewPending, setPreviewPending] = createSignal(false)
  const [selectedScene, setSelectedScene] = createSignal<string | null>(null),
    [selectedSlide, setSelectedSlide] = createSignal<number | null>(null)
  const [targets, setTargets] = createSignal<Target[]>([]),
    [inspectMode, setInspectMode] = createSignal(false),
    [draft, setDraftValue] = createSignal('')
  const [playhead, setPlayhead] = createSignal(0),
    [playing, setPlaying] = createSignal(false),
    [exportPending, setExportPending] = createSignal(false),
    [exportStatus, setExportStatus] = createSignal<ExportStatus | null>(null)
  const [mediaToken, setMediaToken] = createSignal<string | null>(null),
    [assets, setAssets] = createSignal<Asset[]>([]),
    [modelPick, setModel] = createSignal<string | null>(null)
  const composerRef: { current: HTMLTextAreaElement | null } = { current: null },
    player: { current: PlayerCtrl | null } = { current: null }
  let nextRef = 1,
    events: EventSource | null = null,
    generation = 0,
    entryRevision = 0,
    busyRevision = 0,
    projectRevision = 0,
    reconnectTimer = 0,
    disposed = false,
    exportTimer = 0,
    pollInFlight = false,
    autoSeek: { t: number; play: boolean } | null = null,
    playingNow = false
  const setDraft = (v: string | ((d: string) => string)) =>
    setDraftValue(d => (typeof v === 'function' ? v(d) : v))
  const mediaUrl = (path: string | null | undefined, version?: number) =>
    buildMediaUrl(path, mediaToken(), version)
  // Token rotation must not navigate a loaded iframe or restart an audio/video
  // resource. Capture the latest credential only when the artifact changes.
  const captureCredential = createPreviewCredential()
  const previewToken = createMemo(() => captureCredential(mediaToken(), videoVersion()))
  const previewUrl = (path: string | null | undefined) =>
    buildMediaUrl(path, previewToken(), videoVersion())
  const thumbnailUrl = (t: number) =>
    id && mediaToken() ? studio.thumbnailUrl(id, t, mediaToken()!, videoVersion()) : null
  const previewRefresh = createPreviewRefresh({
    read: async () => studio.get(await getToken(), id!),
    held: () => playingNow,
    pending: setPreviewPending,
    error: reason =>
      setPreviewNote(reason instanceof Error ? reason.message : 'Could not refresh the preview'),
    apply: (detail, invalidate) => {
      const before = project()
      const changed =
        invalidate || JSON.stringify(before?.description) !== JSON.stringify(detail.description)
      if (changed) autoSeek = { t: playhead(), play: playingNow }
      projectRevision++
      batch(() => {
        setProject(changed ? detail : { ...detail, description: before!.description })
        if (changed) setVideoVersion(v => v + 1)
        setPreviewNote(null)
        setLiveCount(
          busy() && detail.description.scenes?.length ? detail.description.scenes.length : null,
        )
      })
      void refreshAssets()
    },
  })
  const refresh = async () => {
    if (!id || disposed) return
    previewRefresh.request()
    await previewRefresh.flush()
  }
  const refreshAssets = async () => {
    if (!id) return
    try {
      setAssets(await studio.assets(await getToken(), id))
    } catch {}
  }
  const addAssets = async (files: FileList | File[]) => {
    if (!id || !files.length) return
    const form = new FormData()
    for (const f of Array.from(files)) form.append('files', f)
    const uploaded = await studio.upload(await getToken(), form)
    await studio.addAssets(await getToken(), id, uploaded)
    await refreshAssets()
  }
  const deleteAsset = async (path: string) => {
    if (!id) return
    await studio.deleteAsset(await getToken(), id, path)
    setTargets(v => v.filter(t => t.asset !== path))
    await refreshAssets()
  }
  const addTarget = (el: SelectedElement) => {
    const dup = targets().find(
        t => t.sceneId === el.sceneId && t.selector === el.selector && t.text === el.text,
      ),
      ref = dup?.ref ?? nextRef++
    if (!dup) setTargets(v => [...v, { ...el, ref }])
    setDraft(d => (d.includes(`[${ref}]`) ? d : `${d}${d && !/\s$/.test(d) ? ' ' : ''}[${ref}] `))
    queueMicrotask(() => {
      composerRef.current?.focus()
      if (composerRef.current)
        composerRef.current.selectionStart = composerRef.current.selectionEnd =
          composerRef.current.value.length
    })
  }
  const removeTarget = (ref: number) => setTargets(v => v.filter(t => t.ref !== ref))
  const clearTargets = () => {
    setTargets([])
    nextRef = 1
  }
  const handle = (ev: StudioEvent) => {
    switch (ev.type) {
      case 'hello':
      case 'status':
        busyRevision++
        setBusy(ev.busy)
        setActiveModel(ev.busy ? (ev.activeModel ?? activeModel()) : null)
        break
      case 'entry':
        entryRevision++
        setEntries(v => {
          const existing = v.findIndex(entry => entry.id === ev.entry.id)
          if (existing >= 0) {
            const next = v.slice()
            next[existing] = ev.entry
            return next
          }
          if (ev.entry.role === 'user') {
            const i = v.findIndex(e => e.id.startsWith('local-') && e.text === ev.entry.text)
            if (i >= 0) {
              const n = v.slice()
              n[i] = ev.entry
              return n
            }
          }
          return [...v, ev.entry]
        })
        break
      case 'delta':
        entryRevision++
        setEntries(v => v.map(e => (e.id === ev.id ? { ...e, text: e.text + ev.delta } : e)))
        break
      case 'update':
        entryRevision++
        setEntries(v => v.map(e => (e.id === ev.entry.id ? ev.entry : e)))
        break
      case 'idle':
        busyRevision++
        setBusy(ev.busy ?? false)
        if (!ev.busy) setLiveCount(null)
        previewRefresh.request()
        void refreshAssets()
        break
      case 'reset':
        entryRevision++
        setEntries(ev.entries)
        break
      case 'assets':
        void refreshAssets()
        break
      case 'preview':
        if (!ev.ok) setPreviewNote(ev.error ?? 'the preview does not load')
        else {
          setPreviewNote(null)
          previewRefresh.request(true)
        }
        break
      case 'project':
        setProject(v => (v ? { ...v, ...ev.project, description: v.description } : v))
        break
      case 'error':
        entryRevision++
        setEntries(v => [
          ...v,
          { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${ev.message}` },
        ])
        break
      case 'credit_exhausted':
        entryRevision++
        setEntries(v => [...v, { id: `credit-${Date.now()}`, role: 'credit', text: ev.message }])
        window.dispatchEvent(new Event('credits-changed'))
        break
      case 'credit_balance':
        window.dispatchEvent(
          new CustomEvent('credits-changed', { detail: { balance: ev.balance } }),
        )
        break
      case 'deleted':
        setLoadError('This project was deleted.')
        break
    }
  }
  const connect = async () => {
    if (!id || disposed) return
    const mine = ++generation
    events?.close()
    let token: string
    try {
      token = await getToken()
    } catch {
      return
    }
    if (mine !== generation || disposed) return
    const es = new EventSource(studio.eventsUrl(id, token))
    es.onmessage = e => {
      try {
        handle(JSON.parse(e.data))
      } catch {}
    }
    es.onerror = () => {
      es.close()
      if (mine === generation && !disposed) {
        clearTimeout(reconnectTimer)
        reconnectTimer = window.setTimeout(() => void connect(), 2000)
      }
    }
    events = es
  }
  const download = (url: string, label: string) => {
    const a = document.createElement('a')
    a.href = buildMediaUrl(url, mediaToken(), undefined, { download: label }) ?? url
    a.download = label
    a.click()
  }
  const stopPoll = () => {
    clearInterval(exportTimer)
    exportTimer = 0
  }
  const poll = async () => {
    if (!id || disposed || pollInFlight) return
    pollInFlight = true
    try {
      const st = await studio.getExport(await getToken(), id)
      if (disposed) return
      setExportStatus(st)
      if (!st.running) {
        stopPoll()
        if (st.stage === 'done') {
          if (st.url) download(st.url, exportFilename(st, project()?.title))
          await refresh()
        }
      }
    } catch {
    } finally {
      pollInFlight = false
    }
  }
  const startPoll = () => {
    stopPoll()
    exportTimer = window.setInterval(() => void poll(), 1000)
  }
  onMount(() => {
    let live = true
    const token = () =>
      void getToken()
        .then(t => live && setMediaToken(t))
        .catch(() => {})
    token()
    const tokenTimer = setInterval(token, 45000)
    void connect()
    void (async () => {
      if (!id) return
      const initialEntryRevision = entryRevision
      const initialBusyRevision = busyRevision
      const initialProjectRevision = projectRevision
      const t = await getToken().catch(() => null)
      if (!t) return
      const [d, m, e, a] = await Promise.all([
        studio.get(t, id).catch(() => null),
        studio.messages(t, id).catch(() => ({ entries: [], busy: false, activeModel: null })),
        studio.getExport(t, id).catch(() => null),
        studio.assets(t, id).catch(() => []),
      ])
      if (!live) return
      if (d && projectRevision === initialProjectRevision) setProject(d)
      if (initialEntryRevision === entryRevision) setEntries(m.entries)
      else
        setEntries(current => {
          const liveIds = new Set(current.map(entry => entry.id))
          return [...m.entries.filter(entry => !liveIds.has(entry.id)), ...current]
        })
      if (initialBusyRevision === busyRevision) {
        setBusy(m.busy)
        setActiveModel(m.busy ? m.activeModel : null)
      }
      setAssets(a)
      if (e && !exportPending() && !exportStatus()) {
        setExportStatus(e)
        if (e.running) startPoll()
      }
    })()
    onCleanup(() => {
      live = false
      disposed = true
      previewRefresh.dispose()
      clearInterval(tokenTimer)
      clearTimeout(reconnectTimer)
      generation++
      events?.close()
      stopPoll()
    })
  })
  const upload = async (files: File[]) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return studio.upload(await getToken(), form)
  }
  const send = async (
    text: string,
    opts: {
      uploads?: UploadRef[]
      options?: Record<string, unknown>
      answer?: import('./types').AskAnswer
      delivery?: 'queue' | 'steer'
    } = {},
  ) => {
    if (!id || !text.trim()) return
    const list = targets(),
      scenes = new Set(list.map(t => t.sceneId).filter(Boolean) as string[]),
      slides = new Set(list.map(t => t.slide).filter((x): x is number => typeof x === 'number'))
    const body = withTargetLegend(text.trim(), list),
      scene = list.length ? (scenes.size === 1 ? [...scenes][0] : null) : selectedScene(),
      slide = list.length ? (slides.size === 1 ? [...slides][0] : null) : selectedSlide()
    setDraft('')
    clearTargets()
    const wasBusy = busy()
    const delivery = wasBusy ? (opts.delivery ?? 'queue') : undefined
    setBusy(true)
    if (!wasBusy) setActiveModel(model())
    const localEntryId = `local-${++localId}`
    setEntries(v => [
      ...v,
      {
        id: localEntryId,
        role: 'user',
        text: text.trim(),
        ...(delivery
          ? { pending: delivery === 'steer' ? ('steering' as const) : ('queued' as const) }
          : {}),
      },
    ])
    try {
      const result = await studio.prompt(await getToken(), id, {
        text: body,
        displayText: text.trim(),
        targets: list,
        scene,
        slide,
        uploads: opts.uploads,
        options: opts.options,
        answer: opts.answer,
        model: model() ?? undefined,
        delivery,
      })
      setEntries(current => {
        const received = current.some(entry => entry.id === result.entryId)
        return current.flatMap(entry => {
          if (entry.id !== localEntryId) return [entry]
          return received ? [] : [{ ...entry, id: result.entryId }]
        })
      })
      window.dispatchEvent(new Event('pitch:projects-changed'))
    } catch (err: any) {
      if (!wasBusy) setBusy(false)
      setEntries(v => [
        ...v,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `⚠ ${err?.message ?? 'Could not send'}`,
        },
      ])
    }
  }
  const exportVideo = createExportRequest(
    async body => {
      if (!id) return
      try {
        const st = await studio.startExport(await getToken(), id, body)
        if (disposed) return
        setExportStatus(st)
        if (st.running) startPoll()
        else if (st.stage === 'done') {
          if (st.url) download(st.url, exportFilename(st, project()?.title))
          void refresh()
        }
      } catch (err: any) {
        setExportStatus({
          running: false,
          format: body.format,
          res: typeof body.res === 'string' ? body.res : null,
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
    () => !id || disposed || busy() || !!exportStatus()?.running,
    setExportPending,
  )
  const projectModel = () =>
      typeof project()?.options.model === 'string' ? (project()!.options.model as string) : null,
    model = () => modelPick() ?? projectModel()
  return {
    id,
    get project() {
      return project()
    },
    get loadError() {
      return loadError()
    },
    get entries() {
      return entries()
    },
    get busy() {
      return busy()
    },
    get activeModel() {
      return activeModel()
    },
    get status() {
      return buildStatus(entries(), previewNote())
    },
    get videoVersion() {
      return videoVersion()
    },
    get previewNote() {
      return previewNote()
    },
    get previewPending() {
      return previewPending()
    },
    applyPreview: () => previewRefresh.flush(true),
    get liveCount() {
      return liveCount()
    },
    get selectedScene() {
      return selectedScene()
    },
    setSelectedScene,
    get selectedSlide() {
      return selectedSlide()
    },
    setSelectedSlide,
    get targets() {
      return targets()
    },
    addTarget,
    removeTarget,
    clearTargets,
    get inspectMode() {
      return inspectMode()
    },
    setInspectMode,
    get draft() {
      return draft()
    },
    setDraft,
    composerRef,
    get model() {
      return model()
    },
    setModel,
    get playhead() {
      return playhead()
    },
    setPlayhead,
    get playing() {
      return playing()
    },
    player,
    seekPlayer: (t: number) => player.current?.seek(t),
    consumeAutoSeek: () => {
      const a = autoSeek
      autoSeek = null
      return a
    },
    notePlayerState: (v: boolean) => {
      playingNow = v
      setPlaying(v)
      if (!v) previewRefresh.resume()
    },
    get exportStatus() {
      return exportStatus()
    },
    get exportPending() {
      return exportPending()
    },
    exportVideo,
    cancelExport: async () => {
      if (id) await studio.cancelExport(await getToken(), id).catch(() => {})
    },
    download,
    send,
    steerQueued: async (entryId: string) => {
      if (!id) return
      await studio.steerQueued(await getToken(), id, entryId)
    },
    rollback: async (entry: Entry) => {
      if (!id || busy() || !entry.sessionEntryId || !entry.checkpointId) return
      try {
        const result = await studio.rollback(await getToken(), id, entry.sessionEntryId)
        setEntries(result.entries)
        setProject(current =>
          current ? { ...current, ...result.project, description: current.description } : current,
        )
        setDraft(result.text)
        window.dispatchEvent(new Event('pitch:projects-changed'))
        clearTargets()
        setSelectedScene(null)
        setSelectedSlide(null)
        previewRefresh.request(true)
        await previewRefresh.flush(true)
        await refreshAssets()
        queueMicrotask(() => composerRef.current?.focus())
      } catch (error: any) {
        setEntries(current => [
          ...current,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: `⚠ ${error?.message ?? 'Could not restore this message'}`,
          },
        ])
      }
    },
    stop: async () => {
      if (id) await studio.stop(await getToken(), id).catch(() => {})
    },
    remove: async () => {
      if (id) await studio.remove(await getToken(), id)
    },
    share: async () => {
      if (!id) return null
      const p = await studio.share(await getToken(), id)
      setProject(v => (v ? { ...v, ...p, description: v.description } : v))
      return p.shareSlug ? `${location.origin}/d/${p.shareSlug}` : null
    },
    unshare: async () => {
      if (!id) return
      const next = await studio.unshare(await getToken(), id)
      setProject(current =>
        current ? { ...current, ...next, description: current.description } : current,
      )
    },
    upload,
    get assets() {
      return assets()
    },
    refreshAssets,
    addAssets,
    deleteAsset,
    refresh,
    mediaUrl,
    previewUrl,
    get mediaToken() {
      return mediaToken()
    },
    thumbnailUrl,
    getToken,
  }
}
export type ProjectStore = ReturnType<typeof useProject>
