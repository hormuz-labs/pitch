/**
 * The studio: preview on the left (the flow decides the renderer), the
 * agent's thread and the composer on the right, a scene/slide strip when
 * the flow has one. Everything the model does is visible; everything the
 * agent saves shows up in the preview.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Composer } from './Composer'
import { BrowserPreview } from './previews/BrowserPreview'
import { DeckPreview } from './previews/DeckPreview'
import { HtmlPreview } from './previews/HtmlPreview'
import { VideoPreview } from './previews/VideoPreview'
import { SceneStrip, SlideStrip } from './Strips'
import { Thread } from './Thread'
import { type ProjectStore, useProject } from './useProject'
import './studio.css'

const FLOW_TITLES: Record<string, string> = { 'launch-video': 'Launch video', 'demo-video': 'Demo video', deck: 'Slide deck', 'recording-edit': 'Recording edit' }

function BuildingStage({ busy, status, empty }: { busy: boolean; status: string; empty: string }) {
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
        {busy ? (
          <>
            <div className="building-title">
              <span className="spinner" /> Working
            </div>
            <div className="building-status">{status}</div>
          </>
        ) : (
          <>
            <div className="building-title">Nothing to preview yet</div>
            <div className="building-status">{empty}</div>
          </>
        )}
      </div>
    </div>
  )
}

function Preview({ store }: { store: ProjectStore }) {
  const s = store
  const preview = s.project?.description.preview ?? null
  const empty = s.project?.lastError ? `Last attempt failed: ${s.project.lastError}. Ask the agent to try again.` : 'Describe what you want below — the first result appears here as soon as it exists.'
  if (!preview) return <BuildingStage busy={s.busy} status={s.status} empty={empty} />
  if (preview.kind === 'html') {
    const src = s.mediaUrl(preview.url, s.videoVersion)
    return src ? <HtmlPreview store={s} src={src} /> : null
  }
  if (preview.kind === 'deck') {
    const src = s.mediaUrl(preview.url, s.videoVersion, )
    return src ? <DeckPreview store={s} src={`${src}&studio=1`} /> : null
  }
  if (preview.kind === 'video') {
    const src = s.mediaUrl(preview.url, s.videoVersion)
    return src ? <VideoPreview store={s} src={src} /> : null
  }
  if (preview.kind === 'browser') return <BrowserPreview store={s} profileId={preview.profileId} />
  return null
}

const LAUNCH_RES = [
  { res: '720p', label: '720p', note: '1280 × 720 · quick share' },
  { res: '1080p', label: '1080p', note: '1920 × 1080 · standard' },
  { res: '4k', label: '4K', note: '3840 × 2160 · slow render' },
]

function ExportMenu({ store }: { store: ProjectStore }) {
  const s = store
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const st = s.exportStatus
  const rendering = !!st?.running
  const failed = st?.stage === 'failed' && !rendering
  const isLaunch = s.project?.flow === 'launch-video'
  const outputs = s.project?.outputs ?? []
  const localOutputs = s.project?.description.outputs ?? []
  const renders = (s.project?.description.extra as any)?.renders as Array<{ res: string; url: string; stale: boolean; bytes: number }> | undefined

  useEffect(() => {
    const onDoc = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false)
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
        const status = st?.running && st.res === o.res ? 'rendering…' : have && !have.stale ? `download · ${Math.round(have.bytes / 1e6)} MB` : have ? 'outdated · re-render' : 'render'
        return { key: o.res, label: `${o.label}${paid === o.res ? ' · included' : ''}`, note: o.note, status, onClick: () => void s.exportVideo({ res: o.res }) }
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
      <button className={`topbar-btn export ${failed ? 'failed' : ''} ${open ? 'open' : ''}`} disabled={disabled || (s.busy && !rendering && isLaunch)} title={failed ? (st?.error ?? '') : 'Download the result'} onClick={() => setOpen(v => !v)}>
        <span className="export-fill" style={{ width: rendering ? `${st?.progress ?? 0}%` : '0' }} />
        <span className="export-label">
          {rendering && <span className="spinner" />}
          {label()}
          <svg className="export-caret" viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
            <path d="M2 4l4 4 4-4z" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="export-menu">
          {items.length === 0 && <div className="export-row-note" style={{ padding: 10 }}>Nothing to download yet.</div>}
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

function Topbar({ store }: { store: ProjectStore }) {
  const s = store
  const navigate = useNavigate()
  const p = s.project
  const [shareUrl, setShareUrl] = useState<string | null>(p?.shareSlug && p.isPublic ? `${window.location.origin}/d/${p.shareSlug}` : null)
  useEffect(() => setShareUrl(p?.shareSlug && p.isPublic ? `${window.location.origin}/d/${p.shareSlug}` : null), [p?.shareSlug, p?.isPublic])
  const hasOutput = (p?.outputs.length ?? 0) > 0
  return (
    <div className="job-topbar">
      <button className="topbar-btn" onClick={() => navigate('/projects')}>
        ← Projects
      </button>
      <div className="nav-crumb">
        <span className="editor-project" title={p?.name}>
          {p?.title ?? '…'}
        </span>
        <span className="status-pill" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {FLOW_TITLES[p?.flow ?? ''] ?? p?.flow}
        </span>
        <span className={`status-pill ${s.busy ? 'busy' : ''} ${!s.busy && (p?.description.preview || hasOutput) ? 'ready' : ''}`}>
          {s.busy ? (
            <>
              <span className="spinner" /> working
            </>
          ) : p?.description.preview || hasOutput ? (
            'ready'
          ) : p?.lastError ? (
            'failed'
          ) : (
            'empty'
          )}
        </span>
      </div>
      <span className="topbar-actions">
        {s.busy && (
          <button className="topbar-btn primary" onClick={() => void s.stop()}>
            Stop
          </button>
        )}
        <ExportMenu store={s} />
        {hasOutput && (
          <button
            className="topbar-btn"
            title={shareUrl ? 'Copy the public link' : 'Create a public link'}
            onClick={async () => {
              const url = shareUrl ?? (await s.share().catch(() => null))
              if (!url) return
              setShareUrl(url)
              await navigator.clipboard.writeText(url).catch(() => {})
              alert(`Public link copied:\n${url}`)
            }}
          >
            {shareUrl ? 'Copy link' : 'Share'}
          </button>
        )}
        <button
          className="topbar-btn danger"
          onClick={() => {
            if (p && confirm(`Delete "${p.title}" and everything in it?`)) void s.remove().then(() => navigate('/projects'))
          }}
        >
          Delete
        </button>
      </span>
    </div>
  )
}

export function StudioView({ projectId }: { projectId: string }) {
  const s = useProject(projectId)
  const feedEl = useRef<HTMLDivElement | null>(null)
  const sidebarEl = useRef<HTMLElement | null>(null)
  const drag = useRef({ dragging: false, startX: 0, startW: 0, width: 420 })
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
  const strip = desc?.slides ? <SlideStrip store={s} /> : desc?.scenes || s.project?.flow === 'launch-video' ? <SceneStrip store={s} /> : null

  return (
    <div className="lv-studio">
      <div className="editor-wrap">
        <Topbar store={s} />
        <div className="editor">
          <div className="editor-stage">
            <div className="player">
              <div className="player-stage">
                <Preview store={s} />
              </div>
            </div>
            {strip}
          </div>
          <div
            className="resize-handle"
            onPointerDown={e => {
              drag.current = { ...drag.current, dragging: true, startX: e.clientX, startW: drag.current.width }
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!drag.current.dragging) return
              drag.current.width = Math.min(Math.max(drag.current.startW + (drag.current.startX - e.clientX), 320), 720)
              if (sidebarEl.current) sidebarEl.current.style.width = `${drag.current.width}px`
            }}
            onPointerUp={() => {
              drag.current.dragging = false
            }}
          />
          <aside className="edit-sidebar" ref={sidebarEl} style={{ width: `${drag.current.width}px` }}>
            <div className="feed-header">
              <h2>Agent</h2>
              {s.busy && <span className="timeline-live" style={{ marginLeft: 'auto', fontSize: 11 }}>{s.status}</span>}
            </div>
            <div className="feed" ref={feedEl}>
              {s.entries.length > 0 ? (
                <Thread entries={s.entries} busy={s.busy} />
              ) : (
                <div className="feed-empty">
                  Describe what you want, or ask for a change. Pick a scene or slide below, or press <kbd>i</kbd> and click things in the preview to reference them in your prompt.
                </div>
              )}
            </div>
            <Composer store={s} />
          </aside>
        </div>
      </div>
    </div>
  )
}
