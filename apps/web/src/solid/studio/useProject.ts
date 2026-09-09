import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useAuth } from '../core/auth'
import { mediaUrl as buildMediaUrl, studio } from './client'
import { buildStatus, withTargetLegend } from './helpers'
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
    [videoVersion, setVideoVersion] = createSignal(0)
  const [previewNote, setPreviewNote] = createSignal<string | null>(null),
    [liveCount, setLiveCount] = createSignal<number | null>(null)
  const [selectedScene, setSelectedScene] = createSignal<string | null>(null),
    [selectedSlide, setSelectedSlide] = createSignal<number | null>(null)
  const [targets, setTargets] = createSignal<Target[]>([]),
    [inspectMode, setInspectMode] = createSignal(false),
    [draft, setDraftValue] = createSignal('')
  const [playhead, setPlayhead] = createSignal(0),
    [playing, setPlaying] = createSignal(false),
    [exportStatus, setExportStatus] = createSignal<ExportStatus | null>(null)
  const [mediaToken, setMediaToken] = createSignal<string | null>(null),
    [assets, setAssets] = createSignal<Asset[]>([]),
    [modelPick, setModel] = createSignal<string | null>(null)
  const composerRef: { current: HTMLTextAreaElement | null } = { current: null },
    player: { current: PlayerCtrl | null } = { current: null }
  let nextRef = 1,
    events: EventSource | null = null,
    generation = 0,
    exportTimer = 0,
    autoSeek: { t: number; play: boolean } | null = null,
    playingNow = false
  const setDraft = (v: string | ((d: string) => string)) =>
    setDraftValue(d => (typeof v === 'function' ? v(d) : v))
  const mediaUrl = (path: string | null | undefined, version?: number) =>
    buildMediaUrl(path, mediaToken(), version)
  const thumbnailUrl = (t: number) =>
    id && mediaToken() ? studio.thumbnailUrl(id, t, mediaToken()!, videoVersion()) : null
  const refresh = async () => {
    if (!id) return null
    try {
      const d = await studio.get(await getToken(), id)
      setProject(d)
      return d
    } catch (err: any) {
      setLoadError(
        err?.status === 404
          ? 'This project no longer exists.'
          : (err?.message ?? 'Could not load the project'),
      )
      return null
    }
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
  const onPreviewChanged = async () => {
    const before = project(),
      detail = await refresh()
    if (!detail) return
    const old = before?.description.scenes?.length ?? 0,
      first = detail.description.scenes?.[old]
    autoSeek = first
      ? { t: before?.description.preview ? first.start + 0.01 : 0, play: true }
      : { t: playhead(), play: playingNow }
    setLiveCount(
      busy() && (detail.description.scenes?.length ?? 0) > 0
        ? detail.description.scenes!.length
        : null,
    )
    setVideoVersion(v => v + 1)
    void refreshAssets()
  }
  const handle = (ev: StudioEvent) => {
    switch (ev.type) {
      case 'hello':
      case 'status':
        setBusy(ev.busy)
        break
      case 'entry':
        setEntries(v => {
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
        setEntries(v => v.map(e => (e.id === ev.id ? { ...e, text: e.text + ev.delta } : e)))
        break
      case 'update':
        setEntries(v => v.map(e => (e.id === ev.entry.id ? ev.entry : e)))
        break
      case 'idle':
        setBusy(false)
        setLiveCount(null)
        setVideoVersion(v => v + 1)
        void refresh()
        void refreshAssets()
        break
      case 'assets':
        void refreshAssets()
        break
      case 'preview':
        if (!ev.ok) setPreviewNote(ev.error ?? 'the preview does not load')
        else {
          setPreviewNote(null)
          void onPreviewChanged()
        }
        break
      case 'project':
        setProject(v => (v ? { ...v, ...ev.project, description: v.description } : v))
        break
      case 'error':
        setBusy(false)
        setEntries(v => [
          ...v,
          { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${ev.message}` },
        ])
        break
      case 'deleted':
        setLoadError('This project was deleted.')
        break
    }
  }
  const connect = async () => {
    if (!id) return
    const mine = ++generation
    events?.close()
    let token: string
    try {
      token = await getToken()
    } catch {
      return
    }
    if (mine !== generation) return
    const es = new EventSource(studio.eventsUrl(id, token))
    es.onmessage = e => {
      try {
        handle(JSON.parse(e.data))
      } catch {}
    }
    es.onerror = () => {
      es.close()
      if (mine === generation) setTimeout(() => void connect(), 2000)
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
    if (!id) return
    try {
      const st = await studio.getExport(await getToken(), id)
      setExportStatus(st)
      if (!st.running) {
        stopPoll()
        if (st.stage === 'done') {
          await refresh()
          if (st.url)
            download(st.url, `${project()?.title ?? 'video'}${st.res ? `-${st.res}` : ''}.mp4`)
        }
      }
    } catch {}
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
      const t = await getToken().catch(() => null)
      if (!t) return
      const [d, m, e, a] = await Promise.all([
        studio.get(t, id).catch(() => null),
        studio.messages(t, id).catch(() => ({ entries: [], busy: false })),
        studio.getExport(t, id).catch(() => null),
        studio.assets(t, id).catch(() => []),
      ])
      if (d) setProject(d)
      setEntries(m.entries)
      setBusy(m.busy)
      setAssets(a)
      if (e) {
        setExportStatus(e)
        if (e.running) startPoll()
      }
    })()
    onCleanup(() => {
      live = false
      clearInterval(tokenTimer)
      generation++
      events?.close()
      stopPoll()
    })
  })
  createEffect(() => {
    playingNow = playing()
  })
  const upload = async (files: File[]) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return studio.upload(await getToken(), form)
  }
  const send = async (
    text: string,
    opts: { uploads?: UploadRef[]; options?: Record<string, unknown> } = {},
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
    setBusy(true)
    setEntries(v => [...v, { id: `local-${++localId}`, role: 'user', text: body }])
    try {
      await studio.prompt(await getToken(), id, {
        text: body,
        targets: list,
        scene,
        slide,
        uploads: opts.uploads,
        options: opts.options,
        model: model() ?? undefined,
      })
    } catch (err: any) {
      setBusy(false)
      setEntries(v => [
        ...v,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `⚠ ${err?.status === 409 ? 'The agent is still working — wait for it to finish.' : (err?.message ?? 'Could not send')}`,
        },
      ])
    }
  }
  const exportVideo = async (body: Record<string, unknown> = {}) => {
    if (!id) return
    try {
      const st = await studio.startExport(await getToken(), id, body)
      setExportStatus(st)
      if (st.running) startPoll()
      else if (st.stage === 'done' && st.url)
        download(
          st.url,
          `${project()?.title ?? 'export'}${st.res ? `-${st.res}` : ''}${/\.pdf($|\?)/.test(st.url) ? '.pdf' : '.mp4'}`,
        )
    } catch (err: any) {
      setExportStatus({
        running: false,
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
  }
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
    get status() {
      return buildStatus(entries(), previewNote())
    },
    get videoVersion() {
      return videoVersion()
    },
    get previewNote() {
      return previewNote()
    },
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
    notePlayerState: (v: boolean) => setPlaying(v),
    get exportStatus() {
      return exportStatus()
    },
    exportVideo,
    cancelExport: async () => {
      if (id) await studio.cancelExport(await getToken(), id).catch(() => {})
    },
    download,
    send,
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
    get mediaToken() {
      return mediaToken()
    },
    thumbnailUrl,
    getToken,
  }
}
export type ProjectStore = ReturnType<typeof useProject>
