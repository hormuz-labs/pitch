import { Files, Link, MonitorPlay } from 'lucide-solid'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js'
import { AssetShelf } from './AssetShelf'
import { Composer } from './Composer'
import { BrowserPreview } from './previews/BrowserPreview'
import { DeckPreview } from './previews/DeckPreview'
import { HtmlPreview } from './previews/HtmlPreview'
import { PdfPreview } from './previews/PdfPreview'
import { VideoPreview } from './previews/VideoPreview'
import { SceneStrip, SlideStrip } from './Strips'
import { Thread } from './Thread'
import { type ProjectStore, useProject } from './useProject'
import '../../studio/studio.css'
import './playback.css'
import './preview-stage.css'

const TITLES: Record<string, string> = {
  html: 'Launch film',
  deck: 'Slide deck',
  video: 'Video',
  pdf: 'PDF',
  browser: 'Recording',
}
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
]
function Actions(props: { store: ProjectStore }) {
  const s = props.store,
    [open, setOpen] = createSignal(false),
    [sharing, setSharing] = createSignal(false)
  let wrap: HTMLDivElement | undefined
  const launch = () => s.project?.description.preview?.kind === 'html',
    outputs = () =>
      [
        ...(s.project?.outputs ?? []),
        ...(s.project?.description.outputs ?? []).filter(
          x => !(s.project?.outputs ?? []).some(y => y.url === x.url),
        ),
      ].filter(x => ['video', 'pdf', 'html'].includes(x.kind)),
    renders = () =>
      ((s.project?.description.extra as any)?.renders ?? []) as {
        res: string
        url: string
        stale: boolean
        bytes: number
      }[]
  onMount(() => {
    const close = (e: MouseEvent) => wrap && !wrap.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    onCleanup(() => document.removeEventListener('mousedown', close))
  })
  const share = async () => {
    setSharing(true)
    try {
      const url = await s.share()
      if (url) await navigator.clipboard.writeText(url)
    } finally {
      setSharing(false)
    }
  }
  return (
    <span class="topbar-actions">
      <Show when={s.busy}>
        <button class="topbar-btn primary" onClick={() => void s.stop()}>
          Stop
        </button>
      </Show>
      <button
        class="topbar-btn"
        title="Publish and copy share link"
        disabled={sharing()}
        onClick={() => void share()}
      >
        <Link size={14} /> {s.project?.shareSlug ? 'Copy share link' : 'Share'}
      </button>
      <div class="export-wrap" ref={wrap}>
        <button class="topbar-btn export" onClick={() => setOpen(v => !v)}>
          <span
            class="export-fill"
            style={{ width: s.exportStatus?.running ? `${s.exportStatus.progress}%` : '0' }}
          />
          <span class="export-label">
            {s.exportStatus?.running
              ? `Rendering ${s.exportStatus.progress}%`
              : launch()
                ? 'Export MP4'
                : 'Download'}
          </span>
        </button>
        <Show when={open()}>
          <div class="export-menu">
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
                      disabled={!!s.exportStatus?.running}
                      onClick={() =>
                        have() && !have()!.stale
                          ? s.download(have()!.url, `${s.project?.title ?? 'export'}-${r.res}.mp4`)
                          : void s.exportVideo({ res: r.res })
                      }
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
            <Show when={s.exportStatus?.running}>
              <button class="export-row" onClick={() => void s.cancelExport()}>
                Cancel render
              </button>
            </Show>
            <Show when={s.exportStatus?.stage === 'failed'}>
              <div class="export-error">{s.exportStatus?.error}</div>
            </Show>
          </div>
        </Show>
      </div>
    </span>
  )
}
export function StudioView(props: { projectId: string }) {
  const s = useProject(props.projectId),
    [view, setView] = createSignal<'preview' | 'files'>('preview'),
    [sidebar, setSidebar] = createSignal(
      typeof window === 'undefined' ? 440 : Math.min(520, Math.max(340, innerWidth * 0.3)),
    ),
    [tray, setTray] = createSignal(
      typeof window === 'undefined' ? 220 : Math.min(240, Math.max(180, innerHeight * 0.23)),
    )
  let feed: HTMLDivElement | undefined,
    side: HTMLElement | undefined,
    wrap: HTMLDivElement | undefined,
    stage: HTMLDivElement | undefined,
    followFeed = true,
    drag: { x: number; w: number } | null = null,
    trayDrag: { y: number; h: number } | null = null
  createEffect(() => {
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
  const resizeTray = (height: number) =>
    setTray(Math.max(120, Math.min(height, Math.max(120, (stage?.clientHeight ?? 600) - 200))))
  const hasPreview = createMemo(() => {
    const preview = s.project?.description.preview
    return (
      !!(preview && (preview.kind === 'browser' || ('url' in preview && preview.url))) ||
      s.assets.some(asset => asset.kind === 'image' && asset.origin !== 'upload')
    )
  })
  const showStage = createMemo(() => hasPreview() || (view() === 'files' && s.assets.length > 0))
  onMount(() => {
    const observer = new ResizeObserver(() => resizeTray(tray()))
    if (stage) observer.observe(stage)
    onCleanup(() => observer.disconnect())
  })
  return (
    <div class="lv-studio" classList={{ 'is-chat-only': !showStage() }}>
      <Show when={!s.loadError} fallback={<div class="picker-empty">{s.loadError}</div>}>
        <div class="editor-wrap" ref={wrap} style={{ '--sidebar-w': `${sidebar()}px` }}>
          <header class="job-topbar job-topbar-split">
            <div class="topbar-split-left" style={{ width: `${sidebar()}px` }}>
              <div class="nav-crumb">
                <span class="editor-project">{s.project?.title ?? '…'}</span>
                <span class="project-kind">
                  {TITLES[s.project?.description.preview?.kind ?? ''] ?? 'Project'}
                </span>
                <span
                  class={`project-state ${s.busy ? 'working' : (s.project?.status ?? 'empty')}`}
                >
                  <i />{' '}
                  {s.busy
                    ? 'Working'
                    : s.project?.status
                      ? `${s.project.status[0].toUpperCase()}${s.project.status.slice(1)}`
                      : 'Empty'}
                </span>
              </div>
            </div>
            <div class="topbar-split-right">
              <div class="topbar-split-tabs">
                <Show when={hasPreview()}>
                  <button
                    aria-label="Preview"
                    class={`preview-pane-tab${view() === 'preview' ? ' is-active' : ''}`}
                    onClick={() => setView('preview')}
                  >
                    <MonitorPlay size={15} />
                    <span>Preview</span>
                  </button>
                </Show>
                <Show when={s.assets.length > 0}>
                  <button
                    aria-label={`Files (${s.assets.length})`}
                    class={`preview-pane-tab${view() === 'files' ? ' is-active' : ''}`}
                    onClick={() => {
                      s.player.current?.pause?.()
                      setView(current => (current === 'files' ? 'preview' : 'files'))
                    }}
                  >
                    <Files size={15} />
                    <span>Files</span>
                    <small>{s.assets.length}</small>
                  </button>
                </Show>
              </div>
              <Show
                when={hasPreview()}
                fallback={
                  <Show when={s.busy}>
                    <button class="topbar-btn primary" onClick={() => void s.stop()}>
                      Stop
                    </button>
                  </Show>
                }
              >
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
              <div
                class="feed"
                ref={feed}
                onScroll={event => {
                  const el = event.currentTarget
                  followFeed = el.scrollHeight - el.scrollTop - el.clientHeight < 64
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
              <Composer store={s} />
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
                  Math.max(320, drag.w + e.clientX - drag.x),
                )
                side?.style.setProperty('--sidebar-w', `${w}px`)
                wrap?.style.setProperty('--sidebar-w', `${w}px`)
                setSidebar(w)
              }}
              onPointerUp={() => (drag = null)}
              onPointerCancel={() => (drag = null)}
              onLostPointerCapture={() => (drag = null)}
            />
            <div class="editor-stage" ref={stage} hidden={!showStage()}>
              <div class="studio-preview-view" hidden={view() !== 'preview'}>
                <div class="player">
                  <div class="player-stage">
                    <Show when={hasPreview()}>
                      <Preview store={s} />
                    </Show>
                  </div>
                </div>
                <Show when={stripKind()}>
                  <div
                    class="resize-handle-h"
                    role="separator"
                    aria-label="Resize timeline"
                    aria-orientation="horizontal"
                    aria-valuemin={120}
                    aria-valuemax={Math.max(120, (stage?.clientHeight ?? 600) - 200)}
                    aria-valuenow={Math.round(tray())}
                    tabIndex={0}
                    onKeyDown={event => {
                      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
                      event.preventDefault()
                      resizeTray(
                        event.key === 'Home'
                          ? 120
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
                          e.currentTarget.nextElementSibling?.getBoundingClientRect().height ??
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
                  <div class="tray" style={{ height: `${tray()}px` }}>
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
    </div>
  )
}
