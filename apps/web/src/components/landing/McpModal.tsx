/**
 * McpModal — the "API / MCP" navbar link opens this instead of scrolling to
 * the landing section. A centred dialog wrapping the shared `McpSetup` panel.
 * Portalled into `.lb-root` so the design tokens resolve.
 */
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { McpSetup, REGISTRY_NAME } from './McpSetup'

export const McpModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const host =
    (typeof document !== 'undefined' && document.querySelector('.lb-root')) || document.body

  return createPortal(
    <div className="mcp-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-modal-title">
      <button type="button" className="mcp-modal-scrim" aria-label="Close" onClick={onClose} />

      <div className="mcp-modal-card">
        <div className="mcp-modal-head">
          <div className="mcp-modal-head-copy">
            <p className="lb-chy">MCP · API</p>
            <h2 id="mcp-modal-title">Connect Pitch to your agent</h2>
            <p className="mcp-modal-sub">
              Call Pitch over the Model Context Protocol. It visits the URL, films the demo and
              hands the file back. It&rsquo;s on the official registry as{' '}
              <code className="lb-mcp-name">{REGISTRY_NAME}</code>.
            </p>
          </div>
          <button type="button" className="mcp-modal-x" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.9} aria-hidden />
          </button>
        </div>

        <div className="mcp-modal-body">
          <McpSetup instant />
        </div>

        <div className="mcp-modal-foot">
          <a className="lb-cta lb-cta--ghost" href="/api-keys">
            Get an API key
          </a>
          <a className="lb-cta" href="/docs">
            Go to docs
          </a>
        </div>
      </div>
    </div>,
    host,
  )
}
