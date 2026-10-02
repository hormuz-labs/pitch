import { batch, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { attachmentLimitError } from '../../lib/attachments'
import { useAuth } from '../core/auth'
import {
  adminMediaPath,
  adminStudio,
  mediaUrl as buildMediaUrl,
  type ProjectOwner,
  studio,
} from './client'
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
export const READ_ONLY_MESSAGE = 'This is a read-only admin view of someone else’s project.'
export function useProject(id: string | undefined, opts: { admin?: boolean } = {}) {
  const auth = useAuth()
  // Admin review reads through /admin/projects/* and never writes. Every
  // mutation below refuses before it reaches the network; the server refuses
  // too, since the owner routes scope to the owner and an admin is not one.
  const readOnly = opts.admin === true
  const reader = readOnly ? adminStudio : studio
  const writable = () => {
    if (readOnly) throw new Error(READ_ONLY_MESSAGE)
  }
  const getToken = async () => {
    const token = await auth.getToken()
    if (!token) throw new Error('Not signed in')
    return token
  }
  const [project, setProject] = createSignal<ProjectDetail | null>(null),
    [loadError, setLoadError] = createSignal<string | null>(null),
    [initialLoading, setInitialLoading] = createSignal(true)
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
    [modelPick, setModel] = createSignal<string | null>(null),
    [owner, setOwner] = createSignal<ProjectOwner | null>(null)
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
    buildMediaUrl(readOnly && id && path ? adminMediaPath(id, path) : path, mediaToken(), version)
  // Token rotation must not navigate a loaded iframe or restart an audio/video
  // resource. Capture the latest credential only when the artifact changes.
  const captureCredential = createPreviewCredential()
  const previewToken = createMemo(() => captureCredential(mediaToken(), videoVersion()))
  const previewUrl = (path: string | null | undefined) =>
    buildMediaUrl(path, previewToken(), videoVersion())
  const thumbnailUrl = (t: number) =>
    id && mediaToken() ? reader.thumbnailUrl(id, t, mediaToken()!, videoVersion()) : null
  const previewRefresh = createPreviewRefresh({
    read: async () => reader.get(await getToken(), id!),
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
      setAssets(await reader.assets(await getToken(), id))
    } catch {}
  }
  const addAssets = async (files: FileList | File[]) => {
    writable()
    if (!id || !files.length) return
    const error = attachmentLimitError(Array.from(files))
    if (error) throw new Error(error)
    const form = new FormData()
    for (const f of Array.from(files)) form.append('files', f)
    const uploaded = await studio.upload(await getToken(), form)
    const added = await studio.addAssets(await getToken(), id, uploaded)
    await refreshAssets()
    return added
  }
  const deleteAsset = async (path: string) => {
    writable()
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
        // The owner's credits are not the admin's header to update.
        if (readOnly) break
        entryRevision++
        setEntries(v => [...v, { id: `credit-${Date.now()}`, role: 'credit', text: ev.message }])
        window.dispatchEvent(new Event('credits-changed'))
        break
      case 'credit_balance':
        if (readOnly) break
        window.dispatchEvent(
          new CustomEvent('credits-changed', {
            detail: { balance: ev.balance, pending: ev.pending === true },
          }),
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
    const es = new EventSource(reader.eventsUrl(id, token))
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
      const st = await reader.getExport(await getToken(), id)
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
      try {
        if (!id) return
        const initialEntryRevision = entryRevision
        const initialBusyRevision = busyRevision
        const initialProjectRevision = projectRevision
        const t = await getToken().catch(() => null)
        if (!t) return
        let refused: number | undefined
        const [d, m, e, a] = await Promise.all([
          reader.get(t, id).catch(err => {
            refused = err?.status
            return null
          }),
          reader.messages(t, id).catch(() => null),
          reader.getExport(t, id).catch(() => null),
          reader.assets(t, id).catch(() => null),
        ])
        if (!live) return
        if (!d) {
          setLoadError(
            readOnly && (refused === 401 || refused === 403)
              ? 'Only administrators can open this view.'
              : readOnly && refused === 404
                ? 'No project with this id.'
                : 'Could not load this project. Refresh to try again.',
          )
          return
        }
        if (!m) {
          setLoadError('Could not load this project’s conversation. Refresh to try again.')
          return
        }
        if (!a) {
          setLoadError('Could not load this project’s files. Refresh to try again.')
          return
        }
        setLoadError(null)
        if (readOnly && 'owner' in d) setOwner((d.owner as ProjectOwner | null) ?? null)
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
      } finally {
        if (live) setInitialLoading(false)
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
    writable()
    const error = attachmentLimitError(files)
    if (error) throw new Error(error)
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
    if (readOnly || !id || !text.trim()) return
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
          return received
            ? []
            : [
                {
                  ...entry,
                  id: result.entryId,
                  pending:
                    result.delivery === 'queued'
                      ? ('queued' as const)
                      : result.delivery === 'steered'
                        ? ('steering' as const)
                        : undefined,
                },
              ]
        })
      })
      window.dispatchEvent(new Event('pitch:projects-changed'))
    } catch (err: any) {
      if (!wasBusy) setBusy(false)
      setDraft(current => current || text)
      setEntries(v => [
        ...v.filter(entry => entry.id !== localEntryId),
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
      if (readOnly || !id) return
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
    readOnly,
    get owner() {
      return owner()
    },
    get project() {
      return project()
    },
    get loadError() {
      return loadError()
    },
    get initialLoading() {
      return initialLoading()
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
      if (!readOnly && id) await studio.cancelExport(await getToken(), id).catch(() => {})
    },
    download,
    send,
    steerQueued: async (entryId: string) => {
      writable()
      if (!id) return
      await studio.steerQueued(await getToken(), id, entryId)
      setEntries(current =>
        current.map(entry =>
          entry.id === entryId && entry.pending === 'queued'
            ? { ...entry, pending: 'steering' as const }
            : entry,
        ),
      )
    },
    rollback: async (entry: Entry) => {
      if (readOnly || !id || busy() || !entry.sessionEntryId || !entry.checkpointId) return
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
      if (readOnly || !id) return false
      return (await studio.stop(await getToken(), id)).stopped
    },
    updateProject: async (data: { title?: string; pinnedAt?: string | null }) => {
      writable()
      if (!id) return
      const next = await studio.patch(await getToken(), id, data)
      setProject(current =>
        current ? { ...current, ...next, description: current.description } : current,
      )
      window.dispatchEvent(new Event('pitch:projects-changed'))
    },
    remove: async () => {
      writable()
      if (id) await studio.remove(await getToken(), id)
    },
    share: async () => {
      writable()
      if (!id) return null
      const p = await studio.share(await getToken(), id)
      setProject(v => (v ? { ...v, ...p, description: v.description } : v))
      return p.shareSlug ? `${location.origin}/d/${p.shareSlug}` : null
    },
    unshare: async () => {
      writable()
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
