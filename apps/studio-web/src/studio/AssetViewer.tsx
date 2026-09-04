/**
 * Open one asset, full size.
 *
 * The shelf answers "what have I got"; this answers "what IS that". A card is
 * small enough to recognise a file you already know and not big enough to
 * check one. So a click opens the thing: video and audio play, an image fills
 * the frame, a PDF gets the browser's own viewer.
 *
 * Referencing and deleting live in here too, because the moment you have
 * looked at something is the moment you know whether you want to talk about
 * it or be rid of it.
 *
 * It renders through a PORTAL, into a `.lv-studio` of its own attached to the
 * body. Rendered in place it was a descendant of `.editor-stage`, which
 * redefines the palette tokens for the dark stage — so the panel came out
 * transparent and its buttons drew light-on-light. A modal belongs to the
 * window, not to the panel that opened it.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Asset } from './client'
import type { ProjectStore } from './useProject'

function size(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return `${bytes} B`
}

export function AssetViewer({
  store,
  asset,
  onClose,
}: {
  store: ProjectStore
  asset: Asset
  onClose: () => void
}) {
  const src = store.mediaUrl(asset.url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const reference = () => {
    store.addTarget({
      sceneId: null,
      tagName: 'asset',
      className: '',
      id: '',
      text: asset.name,
      selector: asset.path,
      asset: asset.path,
      assetOrigin: asset.origin,
    })
    onClose()
  }

  const remove = async () => {
    if (!confirm(`Delete ${asset.name}? This removes the file from the project.`)) return
    setBusy(true)
    setError(null)
    try {
      await store.deleteAsset(asset.path)
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete it')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="lv-studio">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the backdrop dismisses */}
      <div className="asset-viewer" onClick={onClose}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: inner clicks must not dismiss */}
        <div className="asset-viewer-box" onClick={e => e.stopPropagation()}>
          <div className="asset-viewer-head">
            <span className="asset-viewer-name" title={asset.path}>
              {asset.name}
            </span>
            <span className="asset-viewer-meta">
              {asset.path} · {size(asset.size)}
            </span>
            <button
              type="button"
              className="asset-viewer-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="asset-viewer-body">
            {!src ? (
              <div className="asset-viewer-note">Loading…</div>
            ) : asset.kind === 'video' ? (
              // biome-ignore lint/a11y/useMediaCaption: the user's own footage
              <video src={src} controls autoPlay preload="metadata" />
            ) : asset.kind === 'audio' ? (
              // biome-ignore lint/a11y/useMediaCaption: the user's own audio
              <audio src={src} controls autoPlay />
            ) : asset.kind === 'image' ? (
              <img src={src} alt={asset.name} />
            ) : asset.kind === 'pdf' ? (
              <iframe src={src} title={asset.name} />
            ) : (
              <div className="asset-viewer-note">Nothing to show for this kind of file.</div>
            )}
          </div>

          <div className="asset-viewer-foot">
            <button type="button" className="viewer-btn primary" onClick={reference}>
              Use in chat
            </button>
            {src && (
              <a className="viewer-btn" href={src} download={asset.name}>
                Download
              </a>
            )}
            {error && <span className="asset-viewer-error">{error}</span>}
            <button
              type="button"
              className="viewer-btn danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
