import { Files, Link, MonitorPlay } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
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

const TITLES: Record<string, string> = {
  html: 'Launch film',
  deck: 'Slide deck',
  video: 'Video',
  pdf: 'PDF',
  browser: 'Recording',
}
function Preview(props: { store: ProjectStore }) {
  const s = props.store,
    p = () => s.project?.description.preview,
    src = () => {
      const x = p()
      return x && 'url' in x ? s.mediaUrl(x.url, s.videoVersion) : null
    }
  return (
    <Show
      when={p()}
      fallback={
        s.busy ? (
          <Build store={s} />
        ) : (
          <div class="building-stage">
            <div class="building-orbs">
              <span class="orb o1" />
              <span class="orb o2" />
              <span class="orb o3" />
            </div>
            <div class="building-copy">
              <MonitorPlay size={20} />
              <div class="building-title">Nothing to preview yet</div>
              <div class="building-status">
                {s.project?.lastError
                  ? `Last attempt failed: ${s.project.lastError}. Ask the agent to try again.`
                  : 'Describe what you want in chat — the first result appears here as soon as it exists.'}
              </div>
            </div>
          </div>
        )
      }
    >
      {x => (
        <Show
          when={x().kind === 'browser'}
          fallback={
            <Show when={src()}>
              {u => (
                <>
                  {x().kind === 'html' ? (
                    <HtmlPreview store={s} src={u()!} />
                  ) : x().kind === 'deck' ? (
                    <DeckPreview store={s} src={`${u()}&studio=1`} />
                  ) : x().kind === 'video' ? (
                    <VideoPreview store={s} src={u()!} />
                  ) : (
                    <PdfPreview store={s} src={u()!} />
                  )}
                </>
              )}
            </Show>
          }
        >
          {<BrowserPreview store={s} profileId={(x() as { profileId: string }).profileId} />}
        </Show>
      )}
    </Show>
  )
}
function Build(props: { store: ProjectStore }) {
  const shots = () => props.store.assets.filter(a => a.kind === 'image' && a.origin !== 'upload')
  return (
    <div class="build-process">
      <div class="build-process__stage">
        <Show when={shots()[0]} fallback={<MonitorPlay size={20} />} keyed>
          {a => <img src={props.store.mediaUrl(a.url, Date.parse(a.mtime)) ?? ''} alt={a.name} />}
        </Show>
        <div class="build-process__status">
          <span class="spinner" />
          <span>{props.store.status}</span>
        </div>
      </div>
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
    </div>
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
      typeof window === 'undefined' ? 520 : Math.min(620, Math.max(360, innerWidth * 0.36)),
    ),
    [tray, setTray] = createSignal(
      typeof window === 'undefined' ? 340 : Math.min(380, Math.max(300, innerHeight * 0.36)),
    )
  let feed: HTMLDivElement | undefined,
    side: HTMLElement | undefined,
    wrap: HTMLDivElement | undefined,
    drag: { x: number; w: number } | null = null,
    trayDrag: { y: number; h: number } | null = null
  createEffect(() => {
    s.entries.reduce((n, e) => n + e.text.length, s.entries.length)
    queueMicrotask(() => {
      if (feed) feed.scrollTop = feed.scrollHeight
    })
  })
  const strip = createMemo(() =>
    s.project?.description.slides ? (
      <SlideStrip store={s} />
    ) : (s.project?.description.scenes?.length ?? 0) > 0 ||
      s.project?.description.preview?.kind === 'html' ? (
      <SceneStrip store={s} />
    ) : null,
  )
  return (
    <div class="lv-studio">
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
                <button
                  class={`preview-pane-tab${view() === 'preview' ? ' is-active' : ''}`}
                  onClick={() => setView('preview')}
                >
                  <MonitorPlay size={15} />
                  <span>Preview</span>
                </button>
                <button
                  class={`preview-pane-tab${view() === 'files' ? ' is-active' : ''}`}
                  onClick={() => setView('files')}
                >
                  <Files size={15} />
                  <span>Files</span>
                  <small>{s.assets.length}</small>
                </button>
              </div>
              <Actions store={s} />
            </div>
          </header>
          <div class="editor">
            <aside
              class={`edit-sidebar${s.busy ? ' is-working' : ''}`}
              ref={side}
              style={{ '--sidebar-w': `${sidebar()}px` }}
              aria-busy={s.busy}
            >
              <div class="feed" ref={feed}>
                <Show
                  when={s.entries.length}
                  fallback={
                    <div class="feed-empty">
                      Describe what you want, or ask for a change. Pick a scene or slide below, or
                      press <kbd>i</kbd> and click things in the preview.
                    </div>
                  }
                >
                  <Thread entries={s.entries} busy={s.busy} onAnswer={s.send} />
                </Show>
              </div>
              <Composer store={s} />
            </aside>
            <div
              class="resize-handle"
              role="separator"
              tabIndex={0}
              onPointerDown={e => {
                drag = { x: e.clientX, w: sidebar() }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={e => {
                if (!drag) return
                const w = Math.min(640, Math.max(340, drag.w + e.clientX - drag.x))
                side?.style.setProperty('--sidebar-w', `${w}px`)
                wrap?.style.setProperty('--sidebar-w', `${w}px`)
                setSidebar(w)
              }}
              onPointerUp={() => (drag = null)}
            />
            <div class="editor-stage">
              <Show
                when={view() === 'preview'}
                fallback={
                  <div class="studio-files-view">
                    <AssetShelf store={s} />
                  </div>
                }
              >
                <div class="player">
                  <div class="player-stage">
                    <Preview store={s} />
                  </div>
                </div>
                <Show when={strip()}>
                  <div
                    class="resize-handle-h"
                    role="separator"
                    tabIndex={0}
                    onPointerDown={e => {
                      trayDrag = { y: e.clientY, h: tray() }
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={e =>
                      trayDrag &&
                      setTray(Math.min(560, Math.max(220, trayDrag.h - (e.clientY - trayDrag.y))))
                    }
                    onPointerUp={() => (trayDrag = null)}
                  />
                </Show>
                <div class="tray" style={strip() ? { height: `${tray()}px` } : undefined}>
                  {strip() ?? (
                    <div class="timeline studio-empty-timeline">
                      <div class="timeline-header">
                        <h2>Timeline</h2>
                        <span class="timeline-meta">Scenes and slides appear here</span>
                      </div>
                    </div>
                  )}
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
