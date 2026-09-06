/**
 * The studio: conversation on the left, the larger preview on the right
 * (the artifact decides the renderer), and a scene/slide strip when
 * the flow has one. Everything the model does is visible; everything the
 * agent saves shows up in the preview.
 */
import { Files, MonitorPlay } from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useAppShell } from '../App'
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
import './studio.css'

/** What the project currently IS, read off the artifact rather than a flag. */
const ARTIFACT_TITLES: Record<string, string> = {
  html: 'Launch film',
  deck: 'Slide deck',
  video: 'Video',
  pdf: 'PDF',
  browser: 'Recording',
}

/**
 * While the agent works and there is no artifact to preview yet, the stage
 * shows the build itself: what the agent is looking at right now — the
 * snapshots and contact sheets it keeps saving to the workspace land on the
 * asset shelf the moment they exist — plus the steps it has taken and its
 * latest thought. Watching the build beats watching a spinner.
 */
function BuildProcess({ store }: { store: ProjectStore }) {
  const s = store
  const shots = s.assets.filter(a => a.kind === 'image' && a.origin !== 'upload')
  const [latest, ...rest] = shots

  return (
    <div className="build-process">
      <div className="build-process__stage">
        {latest ? (
          <img
            key={`${latest.path}:${latest.mtime}`}
            src={s.mediaUrl(latest.url, Date.parse(latest.mtime)) ?? undefined}
            alt={latest.name}
          />
        ) : (
          <span className="building-icon" aria-hidden="true">
            <MonitorPlay size={20} strokeWidth={1.6} />
          </span>
        )}
        <div className="build-process__status">
          <span className="spinner" />
          <span>{s.status || 'Working'}</span>
        </div>
      </div>
      {rest.length > 0 && (
        <div className="build-process__shots">
          {rest.slice(0, 12).map(shot => (
            <img
              key={`${shot.path}:${shot.mtime}`}
              src={s.mediaUrl(shot.thumbUrl ?? shot.url, Date.parse(shot.mtime)) ?? undefined}
              alt={shot.name}
              title={shot.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BuildingStage({ empty }: { empty: string }) {
  return (
    <div className="building-stage">
      <div className="building-orbs">
        <span className="orb o1" />
        <span className="orb o2" />
        <span className="orb o3" />
      </div>
      <div className="building-frames">
        <span className="bframe" />
        <span className="bframe" />
        <span className="bframe" />
        <span className="bframe" />
        <span className="bframe" />
      </div>
      <div className="building-copy">
        <span className="building-icon" aria-hidden="true">
          <MonitorPlay size={20} strokeWidth={1.6} />
        </span>
        <div className="building-title">Nothing to preview yet</div>
        <div className="building-status">{empty}</div>
      </div>
    </div>
  )
}

function Preview({ store }: { store: ProjectStore }) {
  const s = store
  const preview = s.project?.description.preview ?? null
  const empty = s.project?.lastError
    ? `Last attempt failed: ${s.project.lastError}. Ask the agent to try again.`
    : 'Describe what you want in chat — the first result appears here as soon as it exists.'
  if (!preview) {
    return s.busy ? <BuildProcess store={s} /> : <BuildingStage empty={empty} />
  }
  if (preview.kind === 'html') {
    const src = s.mediaUrl(preview.url, s.videoVersion)
    return src ? <HtmlPreview store={s} src={src} /> : null
  }
  if (preview.kind === 'deck') {
    const src = s.mediaUrl(preview.url, s.videoVersion)
    return src ? <DeckPreview store={s} src={`${src}&studio=1`} /> : null
  }
  if (preview.kind === 'video') {
    const src = s.mediaUrl(preview.url, s.videoVersion)
    return src ? <VideoPreview store={s} src={src} /> : null
  }
  if (preview.kind === 'pdf') {
    const src = s.mediaUrl(preview.url, s.videoVersion)
    return src ? <PdfPreview store={s} src={src} /> : null
  }
  if (preview.kind === 'browser') return <BrowserPreview store={s} profileId={preview.profileId} />
  return null
}

function EmptyTimeline({ busy }: { busy: boolean }) {
  return (
    <div className="timeline studio-empty-timeline">
      <div className="timeline-header">
        <h2>Timeline</h2>
        <span className="timeline-meta">
          {busy ? 'Scenes will appear as they are created' : 'Scenes and slides appear here'}
        </span>
      </div>
      <div className={`timeline-empty-strip${busy ? ' is-busy' : ''}`} aria-hidden="true">
        {[1, 2, 3, 4].map(slot => (
          <span key={slot} className="timeline-slot" style={{ '--i': slot } as CSSProperties}>
            {slot}
          </span>
        ))}
      </div>
    </div>
  )
}

const LAUNCH_RES = [
  { res: '720p', label: '720p', note: '1280 × 720 · 60 fps · quick share' },
  { res: '1080p', label: '1080p', note: '1920 × 1080 · 60 fps · standard' },
  { res: '4k', label: '4K', note: '3840 × 2160 · 60 fps · slow render' },
]

function ExportMenu({ store }: { store: ProjectStore }) {
  const s = store
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const st = s.exportStatus
  const rendering = !!st?.running
  const failed = st?.stage === 'failed' && !rendering
  // Resolution tiers belong to the launch engine, which is what an html preview is.
  const isLaunch = s.project?.description.preview?.kind === 'html'
  const outputs = s.project?.outputs ?? []
  const localOutputs = s.project?.description.outputs ?? []
  const renders = (s.project?.description.extra as any)?.renders as
    | Array<{ res: string; url: string; stale: boolean; bytes: number }>
    | undefined

  useEffect(() => {
    const onDoc = (e: MouseEvent) =>
      wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const label = () => {
    if (st?.running) {
      if (st.stage === 'mixing') return 'Mixing audio…'
      if (st.stage === 'encoding') return 'Encoding…'
      if (st.stage === 'muxing') return 'Adding audio…'
      if (st.stage === 'uploading') return 'Uploading…'
      if (st.stage === 'capturing') return `Rendering ${st.res ?? ''} ${st.progress}%`
      return 'Starting render…'
    }
    if (failed) return 'Export failed'
    return isLaunch ? 'Export MP4' : 'Download'
  }

  const items = isLaunch
    ? LAUNCH_RES.map(o => {
        const have = renders?.find(r => r.res === o.res)
        const paid = s.project?.options.resolution ?? '1080p'
        const status =
          st?.running && st.res === o.res
            ? 'rendering…'
            : have && !have.stale
              ? `download · ${Math.round(have.bytes / 1e6)} MB`
              : have
                ? 'outdated · re-render'
                : 'render'
        const ready = have && !have.stale
        return {
          key: o.res,
          label: `${o.label}${paid === o.res ? ' · included' : ''}`,
          note: o.note,
          status,
          onClick: () =>
            ready
              ? s.download(have.url, `${s.project?.title ?? 'export'}-${o.res}.mp4`)
              : void s.exportVideo({ res: o.res }),
        }
      })
    : [...outputs, ...localOutputs.filter(l => !outputs.some(o => o.url === l.url))]
        .filter(o => o.kind === 'video' || o.kind === 'pdf' || o.kind === 'html')
        .map(o => ({
          key: o.url,
          label: o.label ?? (o.kind === 'pdf' ? 'PDF' : o.kind === 'html' ? 'HTML' : 'Video'),
          note: new Date(o.createdAt).toLocaleString(),
          status: 'download',
          onClick: () => {
            const a = document.createElement('a')
            a.href = s.mediaUrl(o.url) ?? o.url
            a.download = `${s.project?.title ?? 'export'}.${o.kind === 'pdf' ? 'pdf' : o.kind === 'html' ? 'html' : 'mp4'}`
            a.target = '_blank'
            a.click()
          },
        }))

  const disabled = !s.project?.description.preview && items.length === 0
  return (
    <div className="export-wrap" ref={wrap}>
      <button
        className={`topbar-btn export ${failed ? 'failed' : ''} ${open ? 'open' : ''}`}
        disabled={disabled || (s.busy && !rendering && isLaunch)}
        title={failed ? (st?.error ?? '') : 'Download the result'}
        onClick={() => setOpen(v => !v)}
      >
        <span
          className="export-fill"
          style={{ width: rendering ? `${st?.progress ?? 0}%` : '0' }}
        />
        <span className="export-label">
          {rendering && <span className="spinner" />}
          {label()}
          <svg
            className="export-caret"
            viewBox="0 0 12 12"
            width="10"
            height="10"
            fill="currentColor"
          >
            <path d="M2 4l4 4 4-4z" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="export-menu">
          {items.length === 0 && (
            <div className="export-row-note" style={{ padding: 10 }}>
              Nothing to download yet.
            </div>
          )}
          {items.map(it => (
            <button
              key={it.key}
              className="export-row"
              disabled={rendering}
              onClick={() => {
                it.onClick()
                setOpen(false)
              }}
            >
              <span className="export-row-main">
                <span className="export-row-label">{it.label}</span>
                <span className="export-row-note">{it.note}</span>
              </span>
              <span className="export-row-status">{it.status}</span>
            </button>
          ))}
          {rendering && (
            <button className="export-row" onClick={() => void s.cancelExport()}>
              <span className="export-row-label">Cancel render</span>
            </button>
          )}
          {failed && st?.error && <div className="export-error">{st.error}</div>}
        </div>
      )}
    </div>
  )
}

function TopbarSplit({
  store,
  view,
  onViewChange,
  sidebarWidth,
}: {
  store: ProjectStore
  view: 'preview' | 'files'
  onViewChange: (view: 'preview' | 'files') => void
  sidebarWidth: number
}) {
  const s = store
  const { isMobile, toggleSidebar } = useAppShell()
  const p = s.project
  const hasOutput = (p?.outputs.length ?? 0) > 0
  const state = s.busy
    ? 'Working'
    : p?.description.preview || hasOutput
      ? 'Ready'
      : p?.lastError
        ? 'Failed'
        : 'Empty'
  const previewKind = s.project?.description.preview?.kind ?? ''

  return (
    <header className="job-topbar job-topbar-split">
      <div
        className="topbar-split-left"
        style={!isMobile ? { width: `${sidebarWidth}px` } : undefined}
      >
        <div className="nav-crumb">
          <span className="editor-project" title={p?.name}>
            {p?.title ?? '…'}
          </span>
          <span className="project-kind">
            {ARTIFACT_TITLES[p?.description.preview?.kind ?? ''] ?? 'Project'}
          </span>
          <span className={`project-state ${state.toLowerCase()}`}>
            <i /> {state}
          </span>
        </div>
      </div>
      <div className="topbar-split-right">
        <div className="topbar-split-tabs">
          <button
            type="button"
            className={`preview-pane-tab${view === 'preview' ? ' is-active' : ''}`}
            aria-pressed={view === 'preview'}
            onClick={() => onViewChange('preview')}
          >
            <MonitorPlay size={15} strokeWidth={1.8} />
            <span>Preview</span>
            <small>{ARTIFACT_TITLES[previewKind] ?? 'Project'}</small>
          </button>
          <button
            type="button"
            className={`preview-pane-tab${view === 'files' ? ' is-active' : ''}`}
            aria-pressed={view === 'files'}
            onClick={() => onViewChange('files')}
          >
            <Files size={15} strokeWidth={1.8} />
            <span>Files</span>
            {s.assets.length > 0 && <small>{s.assets.length}</small>}
          </button>
        </div>
        <span className="topbar-actions">
          {s.busy && (
            <button className="topbar-btn primary" onClick={() => void s.stop()}>
              Stop
            </button>
          )}
          <ExportMenu store={s} />
          {isMobile && (
            <span className="topbar-shell">
              <button
                type="button"
                className="topbar-btn"
                aria-label="Open the menu"
                onClick={toggleSidebar}
              >
                ☰
              </button>
            </span>
          )}
        </span>
      </div>
    </header>
  )
}

/** Preview and files share the artifact pane; scenes stay attached to Preview. */
export function StudioView({ projectId }: { projectId: string }) {
  const s = useProject(projectId)
  const [workspaceView, setWorkspaceView] = useState<'preview' | 'files'>('preview')
  const feedEl = useRef<HTMLDivElement | null>(null)
  const sidebarEl = useRef<HTMLElement | null>(null)
  const editorWrapEl = useRef<HTMLDivElement | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    typeof window === 'undefined'
      ? 520
      : Math.min(620, Math.max(360, Math.round(window.innerWidth * 0.36))),
  )
  const drag = useRef({ dragging: false, startX: 0, startW: 0, width: sidebarWidth })
  const [trayHeight, setTrayHeight] = useState(() =>
    typeof window === 'undefined'
      ? 340
      : Math.round(Math.min(380, Math.max(300, window.innerHeight * 0.36))),
  )
  const dragTray = useRef({ dragging: false, startY: 0, startH: trayHeight })
  const streamLength = s.entries.reduce((n, e) => n + e.text.length, s.entries.length)
  useEffect(() => {
    queueMicrotask(() => {
      if (feedEl.current) feedEl.current.scrollTop = feedEl.current.scrollHeight
    })
  }, [streamLength])

  if (s.loadError) {
    return (
      <div className="lv-studio">
        <div className="picker-empty">{s.loadError}</div>
      </div>
    )
  }
  const desc = s.project?.description
  // The strip is how a timed artifact is selected in: slides for a deck, shots
  // for a launch film, narration beats for a video. A video with no beats (a
  // plain upload, an edit that never ran a transcript) has nothing to list, so
  // it gets no strip rather than an empty one.
  const strip = desc?.slides ? (
    <SlideStrip store={s} />
  ) : (desc?.scenes?.length ?? 0) > 0 || desc?.preview?.kind === 'html' ? (
    <SceneStrip store={s} />
  ) : null
  return (
    <div className="lv-studio">
      <div
        className="editor-wrap"
        ref={editorWrapEl}
        style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
      >
        <TopbarSplit
          store={s}
          view={workspaceView}
          onViewChange={setWorkspaceView}
          sidebarWidth={sidebarWidth}
        />
        <div className="editor">
          <aside
            className="edit-sidebar"
            ref={sidebarEl}
            style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
          >
            <div className="feed" ref={feedEl}>
              {s.entries.length > 0 ? (
                <Thread entries={s.entries} busy={s.busy} />
              ) : (
                <div className="feed-empty">
                  Describe what you want, or ask for a change. Pick a scene or slide below, or press{' '}
                  <kbd>i</kbd> and click things in the preview to reference them in your prompt.
                </div>
              )}
            </div>
            <Composer store={s} />
          </aside>
          <div
            className="resize-handle"
            role="separator"
            aria-label="Resize chat and preview"
            aria-orientation="vertical"
            aria-valuemin={340}
            aria-valuemax={640}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={e => {
              drag.current = {
                ...drag.current,
                dragging: true,
                startX: e.clientX,
                startW: sidebarWidth,
              }
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!drag.current.dragging) return
              const width = Math.min(
                Math.max(drag.current.startW + (e.clientX - drag.current.startX), 340),
                640,
              )
              drag.current.width = width
              sidebarEl.current?.style.setProperty('--sidebar-w', `${width}px`)
              editorWrapEl.current?.style.setProperty('--sidebar-w', `${width}px`)
            }}
            onPointerUp={() => {
              drag.current.dragging = false
              setSidebarWidth(drag.current.width)
            }}
            onPointerCancel={() => {
              drag.current.dragging = false
              setSidebarWidth(drag.current.width)
            }}
            onKeyDown={e => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
              e.preventDefault()
              const width = Math.min(
                Math.max(sidebarWidth + (e.key === 'ArrowRight' ? 20 : -20), 340),
                640,
              )
              drag.current.width = width
              setSidebarWidth(width)
            }}
          />
          <div className="editor-stage">
            {workspaceView === 'preview' ? (
              <>
                <div className="player">
                  <div className="player-stage">
                    <Preview store={s} />
                  </div>
                </div>
                {strip && (
                  <div
                    className="resize-handle-h"
                    role="separator"
                    aria-label="Resize player and timeline"
                    aria-orientation="horizontal"
                    aria-valuemin={220}
                    aria-valuemax={560}
                    aria-valuenow={trayHeight}
                    tabIndex={0}
                    onPointerDown={e => {
                      dragTray.current = {
                        dragging: true,
                        startY: e.clientY,
                        startH: trayHeight,
                      }
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={e => {
                      if (!dragTray.current.dragging) return
                      const nextH = Math.min(
                        Math.max(
                          dragTray.current.startH - (e.clientY - dragTray.current.startY),
                          220,
                        ),
                        560,
                      )
                      setTrayHeight(nextH)
                    }}
                    onPointerUp={() => {
                      dragTray.current.dragging = false
                    }}
                    onPointerCancel={() => {
                      dragTray.current.dragging = false
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                      e.preventDefault()
                      setTrayHeight(height =>
                        Math.min(560, Math.max(220, height + (e.key === 'ArrowUp' ? 24 : -24))),
                      )
                    }}
                  />
                )}
                <div
                  className="tray"
                  style={strip ? ({ height: `${trayHeight}px` } as CSSProperties) : undefined}
                >
                  {strip ?? <EmptyTimeline busy={s.busy} />}
                </div>
              </>
            ) : (
              <div className="studio-files-view">
                <AssetShelf store={s} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
