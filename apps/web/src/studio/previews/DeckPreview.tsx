/**
 * A slide deck: the page as the agent wrote it (one .slide per 1280×720
 * page), scrolled, with the generic inspector injected by the server so the
 * user can point at any element. Clicking a slide in the strip scrolls to it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectStore } from '../useProject'
import { InspectButton, SelectToggle } from './HtmlPreview'

export function DeckPreview({ store, src }: { store: ProjectStore; src: string }) {
  const s = store
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.5)
  const [ready, setReady] = useState(false)
  const post = useCallback(
    (msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(msg, '*'),
    [],
  )

  const updateScale = useCallback(() => {
    const rect = containerRef.current?.parentElement?.getBoundingClientRect()
    if (rect && rect.width > 0) setScale(Math.min(1, rect.width / 1280))
  }, [])

  useEffect(() => {
    updateScale()
    const ro = new ResizeObserver(updateScale)
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement)
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const data = e.data
      if (data?.type === 'studio_element_selected' && data.element) s.addTarget(data.element)
    }
    window.addEventListener('message', onMessage)
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        s.setInspectMode(!s.inspectMode)
      } else if (e.key === 'Escape' && s.inspectMode) s.setInspectMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      ro.disconnect()
      window.removeEventListener('message', onMessage)
      window.removeEventListener('keydown', onKey)
    }
  }, [s, updateScale])

  useEffect(() => {
    if (ready) post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale })
  }, [s.inspectMode, ready, scale, post])
  useEffect(() => {
    if (ready)
      post({
        type: 'studio_set_marks',
        marks: s.targets.map(t => t.mark).filter((m): m is number => m != null),
      })
  }, [s.targets, ready, post])
  useEffect(() => {
    if (ready && s.selectedSlide) post({ type: 'studio_scroll_to', index: s.selectedSlide })
  }, [s.selectedSlide, ready, post])

  const height = containerRef.current?.parentElement?.getBoundingClientRect().height ?? 720

  return (
    <div
      ref={containerRef}
      className={`deck-preview ${s.inspectMode ? 'inspect-active' : ''}`}
      style={{ width: `${1280 * scale}px`, height: `${height}px` }}
    >
      <div
        className="deck-preview-viewport"
        style={{ width: `${1280 * scale}px`, height: `${height}px` }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title="Deck preview"
          onLoad={() => {
            setReady(true)
            post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale })
          }}
          style={{
            width: '1280px',
            height: `${height / scale}px`,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            border: 0,
            background: '#fff',
          }}
        />
      </div>
      <SelectToggle active={s.inspectMode} onClick={() => s.setInspectMode(!s.inspectMode)} />
      {s.inspectMode && (
        <div className="preview-inspect-banner">
          <span className="preview-inspect-pulse" />
          {s.targets.length > 0
            ? `${s.targets.length} selected · click more or press`
            : 'Click anything on a slide to add it to your prompt ·'}{' '}
          <kbd>esc</kbd>
        </div>
      )}
      {s.busy && (
        <div className="preview-updating">
          <span className="spinner" /> {s.status}
        </div>
      )}
      <div className="deck-preview-toolbar">
        <InspectButton active={s.inspectMode} onClick={() => s.setInspectMode(!s.inspectMode)} />
      </div>
    </div>
  )
}
