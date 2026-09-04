/**
 * Live preview of a workspace page driven by the shots.js engine: an iframe
 * scaled to fit, controlled over postMessage (works cross-origin), with the
 * element inspector and a separate audio track kept in lock-step.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fmt } from '../Strips'
import type { ProjectStore } from '../useProject'

interface FrameState {
  ready: boolean
  t: number
  duration: number
  paused: boolean
}

export function HtmlPreview({ store, src }: { store: ProjectStore; src: string }) {
  const s = store
  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stateRef = useRef<FrameState>({ ready: false, t: 0, duration: 0, paused: true })
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [localT, setLocalT] = useState(0)
  const [scale, setScale] = useState(0.5)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [muted, setMuted] = useState(false)
  const audioSrc = s.mediaUrl(s.project?.description.audioUrl, s.videoVersion)

  const post = useCallback(
    (msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(msg, '*'),
    [],
  )
  const cmd = useCallback((op: string, t?: number) => post({ type: 'studio_cmd', op, t }), [post])

  const syncAudio = useCallback(
    (t: number, play: boolean) => {
      const a = audioRef.current
      if (!a || !audioSrc) return
      if (Math.abs(a.currentTime - t) > 0.15) a.currentTime = t
      if (play) void a.play().catch(() => {})
      else a.pause()
    },
    [audioSrc],
  )

  const updateScale = useCallback(() => {
    let w = 0
    let h = 0
    if (document.fullscreenElement === containerRef.current) {
      w = window.innerWidth
      h = window.innerHeight
    } else {
      const rect = containerRef.current?.parentElement?.getBoundingClientRect()
      if (rect) {
        w = rect.width
        h = rect.height
      }
    }
    if (w > 0 && h > 0) setScale(Math.min(w / 1920, h / 1080))
  }, [])

  const setIframeInspect = useCallback(
    (enabled: boolean) => post({ type: 'studio_toggle_inspect', enabled, scale }),
    [post, scale],
  )
  const toggleInspect = useCallback(() => {
    const next = !s.inspectMode
    s.setInspectMode(next)
    setIframeInspect(next)
  }, [s, setIframeInspect])

  useEffect(() => {
    if (s.inspectMode && ready && scale > 0) setIframeInspect(true)
  }, [s.inspectMode, ready, scale, setIframeInspect])

  useEffect(() => {
    if (!ready) return
    post({
      type: 'studio_set_marks',
      marks: s.targets.map(t => t.mark).filter((m): m is number => m != null),
    })
  }, [s.targets, ready, post])

  const togglePlay = useCallback(() => {
    const st = stateRef.current
    if (!st.ready) return
    if (st.paused) {
      const from = st.t >= st.duration - 0.01 ? 0 : st.t
      cmd('play', from)
      syncAudio(from, true)
    } else {
      cmd('pause')
      syncAudio(st.t, false)
    }
  }, [cmd, syncAudio])

  const seekTo = useCallback(
    (t: number, play: boolean) => {
      const target = Math.min(Math.max(0, t), Math.max(0, stateRef.current.duration - 0.001))
      cmd(play ? 'play' : 'seek', target)
      syncAudio(target, play)
      s.setPlayhead(target)
      setLocalT(target)
    },
    [cmd, syncAudio, s],
  )

  const toggleMute = useCallback(() => {
    setMuted(m => {
      if (audioRef.current) audioRef.current.muted = !m
      return !m
    })
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }, [])

  useEffect(() => {
    s.player.current = { seek: t => seekTo(t, true) }
    return () => {
      s.player.current = null
    }
  }, [s.player, seekTo])

  const onReady = useCallback(
    (st: FrameState) => {
      setDuration(st.duration)
      setReady(true)
      updateScale()
      cmd('pause', 0)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      if (s.inspectMode) setIframeInspect(true)
      const jump = s.consumeAutoSeek()
      if (jump) seekTo(jump.t, jump.play)
    },
    [cmd, s, seekTo, setIframeInspect, updateScale],
  )

  useEffect(() => {
    updateScale()
    const ro = new ResizeObserver(updateScale)
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement)
    const onFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
      setTimeout(updateScale, 50)
    }
    document.addEventListener('fullscreenchange', onFs)
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const data = e.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'studio_element_selected' && data.element) s.addTarget(data.element)
      else if (data.type === 'studio_state') {
        const prev = stateRef.current
        const next: FrameState = {
          ready: !!data.ready,
          t: +data.t || 0,
          duration: +data.duration || 0,
          paused: data.paused !== false,
        }
        stateRef.current = next
        if (!prev.ready && next.ready) onReady(next)
        if (next.ready) {
          setLocalT(next.t)
          s.setPlayhead(next.t)
          if (prev.paused !== next.paused) {
            setPlaying(!next.paused)
            s.notePlayerState(!next.paused)
          }
          const a = audioRef.current
          if (a && audioSrc) {
            if (!next.paused && a.paused && !a.ended) {
              a.currentTime = next.t
              void a.play().catch(() => {})
            } else if (next.paused && !a.paused) a.pause()
            else if (!next.paused && Math.abs(a.currentTime - next.t) > 0.15) a.currentTime = next.t
          }
        }
      }
    }
    window.addEventListener('message', onMessage)
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleMute()
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        toggleInspect()
      } else if (e.key === 'Escape' && s.inspectMode) {
        e.preventDefault()
        s.setInspectMode(false)
        setIframeInspect(false)
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        seekTo(stateRef.current.t + 0.5, !stateRef.current.paused)
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        seekTo(stateRef.current.t - 0.5, !stateRef.current.paused)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      ro.disconnect()
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('message', onMessage)
      window.removeEventListener('keydown', onKey)
    }
  }, [
    audioSrc,
    onReady,
    s,
    seekTo,
    setIframeInspect,
    toggleFullscreen,
    toggleInspect,
    toggleMute,
    togglePlay,
    updateScale,
  ])

  const onLoad = () => {
    setReady(false)
    setPlaying(false)
    stateRef.current = { ready: false, t: 0, duration: 0, paused: true }
    setTimeout(() => cmd('state'), 100)
  }

  const hideTimer = useRef(0)
  const onMouseMove = () => {
    setControlsVisible(true)
    window.clearTimeout(hideTimer.current)
    if (playing) hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2500)
  }

  const cls = [
    'live-preview',
    isFullscreen ? 'fullscreen' : '',
    s.inspectMode ? 'inspect-active' : '',
    controlsVisible || !playing ? 'show-controls' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={containerRef}
      className={cls}
      onMouseMove={onMouseMove}
      onMouseLeave={() => playing && setControlsVisible(false)}
      style={isFullscreen ? undefined : { width: `${1920 * scale}px`, height: `${1080 * scale}px` }}
    >
      <div
        className="live-preview-viewport"
        style={{ width: `${1920 * scale}px`, height: `${1080 * scale}px` }}
        onClick={() => !s.inspectMode && togglePlay()}
        onDoubleClick={() => !s.inspectMode && toggleFullscreen()}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title="Live preview"
          onLoad={onLoad}
          style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
        />
        {s.previewNote && <div className="preview-note">{s.previewNote}</div>}
        {audioSrc && <audio ref={audioRef} src={audioSrc} preload="auto" muted={muted} />}
      </div>
      {s.inspectMode && (
        <div className="preview-inspect-banner">
          <span className="preview-inspect-pulse" />
          {s.targets.length > 0
            ? `${s.targets.length} selected · click more or press`
            : 'Click elements to add them to your prompt ·'}{' '}
          <kbd>esc</kbd>
        </div>
      )}
      {!ready && (
        <div className="preview-loading">
          <span className="spinner" /> Loading preview…
        </div>
      )}
      {s.busy && (
        <div className="preview-updating">
          <span className="spinner" /> {s.status}
        </div>
      )}
      <div className="preview-controls">
        <div className="preview-progress-wrap">
          <input
            type="range"
            className="preview-scrub"
            min={0}
            max={duration || 1}
            step={0.05}
            value={localT}
            disabled={!ready}
            onChange={e => seekTo(Number(e.currentTarget.value), false)}
          />
          <div
            className="preview-progress-fill"
            style={{ width: `${(localT / (duration || 1)) * 100}%` }}
          />
        </div>
        <div className="preview-controls-row">
          <button
            className="preview-btn preview-play"
            onClick={togglePlay}
            disabled={!ready}
            title={playing ? 'Pause (k/Space)' : 'Play (k/Space)'}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="preview-btn preview-mute"
            onClick={toggleMute}
            disabled={!ready || !audioSrc}
            title={muted ? 'Unmute (m)' : 'Mute (m)'}
          >
            {muted || !audioSrc ? <MutedIcon /> : <SoundIcon />}
          </button>
          <span className="preview-time">
            {fmt(localT)} / {fmt(duration)}
          </span>
          <div className="preview-spacer" />
          <InspectButton active={s.inspectMode} onClick={toggleInspect} />
          <button
            className="preview-btn preview-fullscreen"
            onClick={toggleFullscreen}
            disabled={!ready}
            title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
          >
            {isFullscreen ? <ExitFsIcon /> : <FsIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)
export const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
)
export const MutedIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
  </svg>
)
export const SoundIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
)
export const FsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
)
export const ExitFsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
  </svg>
)
export function InspectButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className={`preview-btn preview-inspect-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title={active ? 'Stop selecting (esc)' : 'Select an element for the agent (i)'}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M3.5 3.5v17l4.5-4.5 3 6.5 3-1.5-3-6.5h6z" />
      </svg>
    </button>
  )
}
