import { useNavigate } from '@solidjs/router'
import { ChevronDown, ChevronUp, MonitorPlay, MoreHorizontal, Share2 } from 'lucide-solid'
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js'
import { PitchWordmark } from '../public/brand'
import { AssetShelf } from './AssetShelf'
import { Composer } from './Composer'
import { type EditableFormat, type ExportResolution, exportFilename } from './editable-export'
import { animateToLatest, FeedJumpLatest, isAwayFromLatest } from './FeedJumpLatest'
import { BrowserPreview } from './previews/BrowserPreview'
import { DeckPreview } from './previews/DeckPreview'
import { HtmlPreview } from './previews/HtmlPreview'
import { PdfPreview } from './previews/PdfPreview'
import { VideoPreview } from './previews/VideoPreview'
import { SceneStrip, SlideStrip } from './Strips'
import { StudioProjectControls } from './StudioProjectControls'
import { StudioTopbarFiles } from './StudioTopbarFiles'
import { Thread } from './Thread'
import { clampTimelineHeight, timelineHeightLimit, timelineRowsHeight } from './timelineResize'
import { type ProjectStore, useProject } from './useProject'
import '../../studio/studio.css'
import './playback.css'
import './preview-stage.css'

function Preview(props: { store: ProjectStore }) {
  const s = props.store
  const preview = () => s.project?.description.preview
  const kind = createMemo(() => preview()?.kind)
  const src = createMemo(() => {
    const value = preview()
    return value && 'url' in value ? s.previewUrl(value.url) : null
  })
  return (
    <Switch fallback={<Build store={s} />}>
      <Match when={kind() === 'html' && !!src()}>
        <HtmlPreview store={s} src={src()!} />
      </Match>
      <Match when={kind() === 'deck' && !!src()}>
        <DeckPreview store={s} src={`${src()}&studio=1`} />
      </Match>
      <Match when={kind() === 'video' && !!src()}>
        <VideoPreview store={s} src={src()!} />
      </Match>
      <Match when={kind() === 'pdf' && !!src()}>
        <PdfPreview store={s} src={src()!} />
      </Match>
      <Match when={kind() === 'browser'}>
        <BrowserPreview store={s} profileId={(preview() as { profileId: string }).profileId} />
      </Match>
    </Switch>
  )
}
function Build(props: { store: ProjectStore }) {
  const shots = () => props.store.assets.filter(a => a.kind === 'image' && a.origin !== 'upload')
  return (
    <Show when={shots().length > 0}>
      <div class="build-process">
        <div class="build-process__heading">
          <span>From your workspace</span>
          <small>{props.store.busy ? 'Work in progress' : 'Project images'}</small>
        </div>
        <div class="build-process__stage">
          <Show when={shots()[0]} keyed>
            {a => <img src={props.store.mediaUrl(a.url, Date.parse(a.mtime)) ?? ''} alt={a.name} />}
          </Show>
        </div>
        <Show when={props.store.busy}>
          <div class="build-process__status" role="status">
            <span class="spinner" />
            <span>{props.store.status}</span>
          </div>
        </Show>
        <Show when={shots().length > 1}>
          <div class="build-process__shots">
            <For each={shots().slice(1, 13)}>
              {a => (
                <img
                  src={props.store.mediaUrl(a.thumbUrl ?? a.url, Date.parse(a.mtime)) ?? ''}
                  alt={a.name}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
const RES = [
  { res: '720p', note: '1280 × 720 · 60 fps · quick share' },
  { res: '1080p', note: '1920 × 1080 · 60 fps · standard' },
  { res: '4k', note: '3840 × 2160 · 60 fps · slow render' },
] satisfies { res: ExportResolution; note: string }[]
const EDITABLE_FORMATS: { format: EditableFormat; label: string; note: string }[] = [
  { format: 'premiere', label: 'Premiere Pro', note: 'Image motion + baked sequence' },
  { format: 'after-effects', label: 'After Effects', note: 'Native text, images + fallback' },
  { format: 'blender', label: 'Blender', note: 'Native text, images + fallback' },
]
export function Actions(props: { store: ProjectStore }) {
  const s = props.store,
    [open, setOpen] = createSignal(false),
    [resolution, setResolution] = createSignal<ExportResolution>('1080p'),
    menuId = createUniqueId(),
    resolutionId = createUniqueId(),
    [sharing, setSharing] = createSignal(false)
  let wrap: HTMLDivElement | undefined, trigger: HTMLButtonElement | undefined
  const launch = () => s.project?.description.preview?.kind === 'html',
    editable = () => launch() || s.project?.description.preview?.kind === 'video',
    exportBlocked = () => s.busy || s.exportPending || !!s.exportStatus?.running,
    currentRender = () => renders().find(r => r.res === resolution() && !r.stale),
    exportProgress = () =>
      s.exportPending
        ? 'Starting export...'
        : (s.exportStatus?.progress ?? 0) <= 0
          ? 'Warming up...'
          : `${s.exportStatus?.stage === 'packaging' ? 'Packaging' : 'Rendering'} ${s.exportStatus?.progress ?? 0}%`,
    outputs = () =>
      [
        ...(s.project?.outputs ?? []),
        ...(s.project?.description.outputs ?? []).filter(
          x => !(s.project?.outputs ?? []).some(y => y.url === x.url),
        ),
      ].filter(x => ['video', 'pdf', 'html'].includes(x.kind)),
    renders = () => {
      const extra = s.project?.description.extra as any
      const local = (extra?.renders ?? []) as {
        res: string
        url: string
        stale: boolean
        bytes: number
      }[]
      const localRes = new Set(local.map(render => render.res))
      const sourceModifiedAt = Number(extra?.sourceModifiedAt ?? 0)
      const published = (s.project?.outputs ?? [])
        .filter(output => output.kind === 'video' && output.res && !localRes.has(output.res))
        .map(output => ({
          res: output.res!,
          url: output.url,
          stale: sourceModifiedAt > Date.parse(output.createdAt),
          bytes: 0,
        }))
      return [...local, ...published]
    }
  onMount(() => {
    const close = (e: MouseEvent) => wrap && !wrap.contains(e.target as Node) && setOpen(false)
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open()) return
      e.preventDefault()
      setOpen(false)
      trigger?.focus()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    onCleanup(() => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    })
  })
  const share = async () => {
    setSharing(true)
    try {
      const url = await s.share()
      if (url) await navigator.clipboard.writeText(url)
      setOpen(false)
    } finally {
      setSharing(false)
    }
  }
  const canShare = () =>
    Boolean(s.project?.shareSlug) ||
    (!s.exportStatus?.running && Boolean(s.project?.description.outputs?.length))
  return (
    <span class="topbar-actions">
      <button
        type="button"
        class="topbar-btn topbar-share"
        title={canShare() ? 'Publish and copy share link' : 'Render the project before sharing'}
        disabled={sharing() || !canShare()}
        onClick={() => void share()}
      >
        <Share2 size={15} />
        <span>{sharing() ? 'Sharing…' : s.project?.shareSlug ? 'Copy share link' : 'Share'}</span>
      </button>
      <div class="export-wrap" ref={wrap}>
        <button
          class="topbar-btn export topbar-more"
          ref={trigger}
          aria-label={
            s.exportPending || s.exportStatus?.running
              ? `${exportProgress()}. Open project actions`
              : 'Open export options'
          }
          aria-expanded={open()}
          aria-controls={menuId}
          onClick={() => setOpen(v => !v)}
        >
          <span
            class="export-fill"
            style={{ width: s.exportStatus?.running ? `${s.exportStatus.progress}%` : '0' }}
          />
          <MoreHorizontal class="topbar-more-icon" size={17} />
          <span class="export-label">
            {s.exportPending || s.exportStatus?.running ? (
              exportProgress()
            ) : (
              <>
                <span class="topbar-export-label">Export</span>
                <span class="topbar-more-label">More</span>
              </>
            )}
          </span>
        </button>
        <Show when={open()}>
          <div class="export-menu" id={menuId}>
            <button
              class="export-row export-row-action mobile-share-action"
              title={
                canShare() ? 'Publish and copy share link' : 'Render the project before sharing'
              }
              disabled={sharing() || !canShare()}
              onClick={() => void share()}
            >
              <span class="export-row-action-icon">
                <Share2 size={15} />
              </span>
              <span class="export-row-main">
                <span class="export-row-label">
                  {sharing()
                    ? 'Sharing…'
                    : s.project?.shareSlug
                      ? 'Copy share link'
                      : 'Share project'}
                </span>
                <span class="export-row-note">Publish a link others can open</span>
              </span>
            </button>
            <div class="export-section-heading export-section-heading--video">
              <span class="export-section-title">Video</span>
              <span class="export-section-note">MP4</span>
            </div>
            <Show
              when={launch()}
              fallback={
                <For each={outputs()}>
                  {o => (
                    <button
                      class="export-row"
                      onClick={() =>
                        s.download(
                          o.url,
                          `${s.project?.title ?? 'export'}.${o.kind === 'pdf' ? 'pdf' : o.kind === 'html' ? 'html' : 'mp4'}`,
                        )
                      }
                    >
                      <span class="export-row-main">
                        <span class="export-row-label">{o.label ?? o.kind.toUpperCase()}</span>
                        <span class="export-row-note">
                          {new Date(o.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <span class="export-row-status">download</span>
                    </button>
                  )}
                </For>
              }
            >
              <For each={RES}>
                {r => {
                  const have = () => renders().find(x => x.res === r.res)
                  return (
                    <button
                      class="export-row"
                      disabled={exportBlocked()}
                      onClick={() => {
                        setResolution(r.res)
                        have() && !have()!.stale
                          ? s.download(have()!.url, `${s.project?.title ?? 'export'}-${r.res}.mp4`)
                          : void s.exportVideo({ res: r.res })
                      }}
                    >
                      <span class="export-row-main">
                        <span class="export-row-label">{r.res}</span>
                        <span class="export-row-note">{r.note}</span>
                      </span>
                      <span class="export-row-status">
                        {have() && !have()!.stale ? 'download' : 'render'}
                      </span>
                    </button>
                  )
                }}
              </For>
            </Show>
            <Show when={editable()}>
              <div class="export-section">
                <div class="export-section-heading">
                  <span class="export-section-title">Editable project</span>
                  <span class="export-section-note">ZIP · Beta</span>
                </div>
                <Show when={launch()} fallback={<p class="export-hint">Uses source resolution.</p>}>
                  <div class="export-resolution">
                    <label for={resolutionId}>Resolution</label>
                    <select
                      id={resolutionId}
                      value={resolution()}
                      disabled={exportBlocked()}
                      onChange={e => setResolution(e.currentTarget.value as ExportResolution)}
                    >
                      <For each={RES}>{r => <option value={r.res}>{r.res}</option>}</For>
                    </select>
                  </div>
                  <p class="export-hint export-hint--status" role="status">
                    {currentRender()
                      ? `Uses the current ${resolution()} MP4.`
                      : `Render ${resolution()} above first.`}
                  </p>
                </Show>
                <p class="export-hint">
                  Text and images stay editable where supported. Complex effects use a rendered
                  fallback.
                </p>
              </div>
              <For each={EDITABLE_FORMATS}>
                {item => (
                  <button
                    class="export-row"
                    disabled={exportBlocked() || (launch() && !currentRender())}
                    onClick={() =>
                      void s.exportVideo({
                        format: item.format,
                        ...(launch() ? { res: resolution() } : {}),
                      })
                    }
                  >
                    <span class="export-row-main">
                      <span class="export-row-label">{item.label}</span>
                      <span class="export-row-note">{item.note}</span>
                    </span>
                    <span class="export-row-status">ZIP</span>
                  </button>
                )}
              </For>
            </Show>
            <Show when={s.exportPending || s.exportStatus?.running}>
              <div class="export-hint export-feedback" role="status">
                {exportProgress()}
              </div>
            </Show>
            <Show when={s.exportStatus?.running}>
              <button class="export-row" onClick={() => void s.cancelExport()}>
                Cancel export
              </button>
            </Show>
            <Show when={!s.exportPending && s.exportStatus?.stage === 'done' && s.exportStatus.url}>
              <div class="export-hint export-feedback" role="status">
                Export ready. If the download did not start, download it below.
              </div>
              <button
                class="export-row export-download"
                onClick={() =>
                  s.download(
                    s.exportStatus!.url!,
                    exportFilename(s.exportStatus!, s.project?.title),
                  )
                }
              >
                <span class="export-row-main">
                  <span class="export-row-label">Download export</span>
                  <span class="export-row-note">
                    {exportFilename(s.exportStatus!, s.project?.title)}
                  </span>
                </span>
              </button>
            </Show>
            <Show when={!s.exportPending && s.exportStatus?.stage === 'failed'}>
              <div class="export-error" role="alert">
                {s.exportStatus?.error}
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </span>
  )
}
export function StudioView(props: { projectId: string }) {
  const s = useProject(props.projectId),
    navigate = useNavigate(),
    previewId = createUniqueId(),
    timelineId = createUniqueId(),
    [mobileLayout, setMobileLayout] = createSignal(window.innerWidth <= 840),
    [previewCollapsed, setPreviewCollapsed] = createSignal(false),
    [showJumpToLatest, setShowJumpToLatest] = createSignal(false),
    [timelineOpen, setTimelineOpen] = createSignal(true),
    [view, setView] = createSignal<'preview' | 'files'>('preview'),
    [sidebar, setSidebar] = createSignal(
      typeof window === 'undefined' ? 440 : Math.min(520, Math.max(400, innerWidth * 0.34)),
    ),
    [tray, setTray] = createSignal(
      typeof window === 'undefined' ? 220 : Math.min(240, Math.max(180, innerHeight * 0.23)),
    )
  let feed: HTMLDivElement | undefined,
    side: HTMLElement | undefined,
    wrap: HTMLDivElement | undefined,
    stage: HTMLDivElement | undefined,
    hadPreview = false,
    followFeed = true,
    drag: { x: number; w: number } | null = null,
    trayDrag: { y: number; h: number } | null = null
  const newChat = () => {
    navigate('/new')
    window.dispatchEvent(new Event('pitch:new-chat'))
  }
  const jumpToLatest = () => {
    if (!feed) return
    followFeed = true
    setShowJumpToLatest(false)
    animateToLatest(feed)
  }
  const renameProject = async () => {
    const current = s.project?.title ?? ''
    const title = window.prompt('Edit chat name', current)?.trim()
    if (!title || title === current) return
    try {
      await s.updateProject({ title })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not rename chat')
    }
  }
  const togglePin = async () => {
    try {
      await s.updateProject({ pinnedAt: s.project?.pinnedAt ? null : new Date().toISOString() })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not update pin')
    }
  }
  const deleteProject = async () => {
    const title = s.project?.title || 'Untitled project'
    if (!window.confirm(`Delete “${title}”?`)) return
    try {
      await s.remove()
      window.dispatchEvent(new Event('pitch:projects-changed'))
      navigate('/new')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not delete chat')
    }
  }
  createEffect(() => {
    previewCollapsed()
    s.busy
    s.entries.reduce((n, e) => n + e.text.length, s.entries.length)
    queueMicrotask(() => {
      if (feed && followFeed) feed.scrollTop = feed.scrollHeight
    })
  })
  const stripKind = createMemo(() =>
    s.project?.description.slides
      ? 'slides'
      : (s.project?.description.scenes?.length ?? 0) > 0 ||
          s.project?.description.preview?.kind === 'html'
        ? 'scenes'
        : null,
  )
  const emptyTimeline = createMemo(
    () => stripKind() === 'scenes' && !s.project?.description.scenes?.length,
  )
  const trayMaximum = () => {
    const element = document.getElementById(timelineId)
    const rows = element?.querySelectorAll<HTMLElement>('.pro-timeline-canvas > .modular-track-row')
    const toolbar = element?.querySelector<HTMLElement>('.pro-timeline-toolbar')
    return timelineHeightLimit(
      stage?.clientHeight ?? 600,
      timelineRowsHeight(rows ?? []),
      toolbar?.offsetHeight ?? 0,
    )
  }
  const resizeTray = (height: number) => setTray(clampTimelineHeight(height, trayMaximum()))
  const hasPreview = createMemo(() => {
    const preview = s.project?.description.preview
    return (
      !!(preview && (preview.kind === 'browser' || ('url' in preview && preview.url))) ||
      s.assets.some(asset => asset.kind === 'image' && asset.origin !== 'upload')
    )
  })
  const showStage = createMemo(() => hasPreview() || (view() === 'files' && s.assets.length > 0))
  const previewHidden = () => mobileLayout() && previewCollapsed()
  const previewLabel = () =>
    ['html', 'video'].includes(s.project?.description.preview?.kind ?? '') ? 'video' : 'preview'
  const emptyChat = createMemo(() => !showStage() && !s.entries.length && !s.busy)
  createEffect(() => {
    const available = hasPreview()
    if (available && !hadPreview) {
      setView('preview')
      setPreviewCollapsed(false)
    }
    hadPreview = available
  })
  onMount(() => {
    const resize = () => setMobileLayout(window.innerWidth <= 840)
    window.addEventListener('resize', resize)
    onCleanup(() => window.removeEventListener('resize', resize))
    const observer = new ResizeObserver(() => {
      if (stage && stage.clientHeight > 0) resizeTray(tray())
    })
    if (stage) observer.observe(stage)
    onCleanup(() => observer.disconnect())
  })
  return (
    <div
      class="lv-studio"
      classList={{
        'is-chat-only': !showStage(),
        'is-chat-empty': emptyChat(),
        'is-chat-expanded': true,
        'is-preview-collapsed': previewHidden(),
      }}
    >
      <Show
        when={!s.initialLoading}
        fallback={
          <div class="studio-opening" role="status" aria-live="polite">
            <span class="spinner" aria-hidden="true" />
            <span>Opening project…</span>
          </div>
        }
      >
        <Show when={!s.loadError} fallback={<div class="picker-empty">{s.loadError}</div>}>
          <div class="editor-wrap" ref={wrap} style={{ '--sidebar-w': `${sidebar()}px` }}>
            <header class="job-topbar job-topbar-split">
              <div class="topbar-split-left">
                <div class="nav-crumb">
                  <StudioProjectControls
                    title={s.project?.title}
                    pinned={Boolean(s.project?.pinnedAt)}
                    onNew={newChat}
                    onRename={() => void renameProject()}
                    onTogglePin={() => void togglePin()}
                    onDelete={() => void deleteProject()}
                  />
                </div>
              </div>
              <div class="topbar-split-right">
                <div class="topbar-split-tabs">
                  <Show when={hasPreview()}>
                    <button
                      aria-label="Preview"
                      class={`preview-pane-tab${view() === 'preview' ? ' is-active' : ''}`}
                      onClick={() => {
                        setView('preview')
                        setPreviewCollapsed(false)
                      }}
                    >
                      <MonitorPlay size={15} />
                      <span class="preview-pane-tab__label">Preview</span>
                    </button>
                  </Show>
                  <Show when={s.assets.length > 0}>
                    <StudioTopbarFiles
                      count={s.assets.length}
                      active={view() === 'files'}
                      onClick={() => {
                        s.player.current?.pause?.()
                        setPreviewCollapsed(false)
                        setView(current => (current === 'files' ? 'preview' : 'files'))
                      }}
                    />
                  </Show>
                </div>
                <Show when={hasPreview()}>
                  <Actions store={s} />
                </Show>
              </div>
            </header>
            <div class="editor">
              <aside
                class={`edit-sidebar${s.busy ? ' is-working' : ''}`}
                ref={side}
                style={{ '--sidebar-w': `${sidebar()}px` }}
                aria-busy={s.busy}
              >
                <Show when={emptyChat()}>
                  <div class="chat-welcome">
                    <PitchWordmark class="chat-welcome__wordmark" />
                    <h1>What do you want to create?</h1>
                  </div>
                </Show>
                <div
                  class="feed"
                  hidden={emptyChat()}
                  ref={feed}
                  onScroll={event => {
                    const el = event.currentTarget
                    followFeed = !isAwayFromLatest(el)
                    setShowJumpToLatest(!followFeed)
                  }}
                >
                  <Show
                    when={s.entries.length || s.busy}
                    fallback={
                      <div class="feed-empty">
                        Describe what you want to create. Your preview will open when there’s
                        something to show.
                      </div>
                    }
                  >
                    <Thread
                      entries={s.entries}
                      busy={s.busy}
                      onAnswer={s.send}
                      onEdit={entry => void s.rollback(entry)}
                    />
                  </Show>
                </div>
                <div class="studio-composer-dock">
                  <Show when={showJumpToLatest()}>
                    <FeedJumpLatest onClick={jumpToLatest} />
                  </Show>
                  <Composer store={s} />
                </div>
              </aside>
              <div
                class="resize-handle"
                hidden={!showStage()}
                role="separator"
                aria-label="Resize conversation"
                aria-orientation="vertical"
                tabIndex={0}
                onPointerDown={e => {
                  drag = { x: e.clientX, w: sidebar() }
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={e => {
                  if (!drag) return
                  const w = Math.min(
                    640,
                    (wrap?.clientWidth ?? innerWidth) * 0.48,
                    Math.max(400, drag.w + e.clientX - drag.x),
                  )
                  side?.style.setProperty('--sidebar-w', `${w}px`)
                  wrap?.style.setProperty('--sidebar-w', `${w}px`)
                  setSidebar(w)
                }}
                onPointerUp={() => (drag = null)}
                onPointerCancel={() => (drag = null)}
                onLostPointerCapture={() => (drag = null)}
              />
              <Show when={hasPreview() && view() === 'preview'}>
                <button
                  type="button"
                  class="mobile-preview-toggle"
                  aria-controls={previewId}
                  aria-expanded={!previewHidden()}
                  onClick={() => {
                    if (!previewCollapsed()) {
                      s.player.current?.pause?.()
                    }
                    setPreviewCollapsed(collapsed => !collapsed)
                  }}
                >
                  <MonitorPlay size={16} aria-hidden="true" />
                  <span>
                    {previewHidden() ? 'Expand' : 'Collapse'} {previewLabel()}
                  </span>
                  {previewHidden() ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </Show>
              <div
                class="editor-stage"
                id={previewId}
                ref={stage}
                hidden={!showStage() || previewHidden()}
              >
                <div class="studio-preview-view" hidden={view() !== 'preview'}>
                  <div class="player">
                    <div class="player-stage">
                      <Show when={hasPreview()}>
                        <Preview store={s} />
                      </Show>
                    </div>
                  </div>
                  <Show when={stripKind() && timelineOpen() && !emptyTimeline()}>
                    <div
                      class="resize-handle-h"
                      role="separator"
                      aria-label="Resize timeline"
                      aria-orientation="horizontal"
                      aria-valuemin={180}
                      aria-valuemax={trayMaximum()}
                      aria-valuenow={Math.round(tray())}
                      tabIndex={0}
                      onKeyDown={event => {
                        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
                        event.preventDefault()
                        resizeTray(
                          event.key === 'Home'
                            ? 180
                            : event.key === 'End'
                              ? Infinity
                              : tray() + (event.key === 'ArrowUp' ? 24 : -24),
                        )
                      }}
                      onPointerDown={e => {
                        e.preventDefault()
                        e.currentTarget.focus()
                        trayDrag = {
                          y: e.clientY,
                          h:
                            document.getElementById(timelineId)?.getBoundingClientRect().height ??
                            tray(),
                        }
                        e.currentTarget.setPointerCapture(e.pointerId)
                      }}
                      onPointerMove={e =>
                        trayDrag && resizeTray(trayDrag.h - (e.clientY - trayDrag.y))
                      }
                      onPointerUp={() => (trayDrag = null)}
                      onPointerCancel={() => (trayDrag = null)}
                      onLostPointerCapture={() => (trayDrag = null)}
                    />
                  </Show>
                  <Show when={stripKind()}>
                    <button
                      type="button"
                      class="editor-tracks-toggle"
                      aria-controls={timelineId}
                      aria-expanded={timelineOpen()}
                      onClick={() => setTimelineOpen(open => !open)}
                    >
                      <span>{stripKind() === 'slides' ? 'Slides' : 'Video editor'}</span>
                      <span class="editor-tracks-toggle__hint">
                        {timelineOpen() ? 'Collapse' : 'Expand'}
                      </span>
                      {timelineOpen() !== mobileLayout() ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronUp size={16} />
                      )}
                    </button>
                    <div
                      id={timelineId}
                      class="tray"
                      classList={{ 'is-empty': emptyTimeline() }}
                      hidden={!timelineOpen()}
                      style={{ height: emptyTimeline() ? 'auto' : `${tray()}px` }}
                    >
                      <Switch>
                        <Match when={stripKind() === 'slides'}>
                          <SlideStrip store={s} />
                        </Match>
                        <Match when={stripKind() === 'scenes'}>
                          <SceneStrip store={s} />
                        </Match>
                      </Switch>
                    </div>
                  </Show>
                </div>
                <Show when={view() === 'files'}>
                  <div class="studio-files-view">
                    <AssetShelf store={s} />
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
