/**
 * McpModal — the "API / MCP" navbar link opens this instead of scrolling to
 * the landing section. It uses the same setup panel as the signed-in settings
 * modal, so every API/MCP entry point presents one consistent flow.
 */
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { McpSettingsPanel } from '../McpSettingsPanel'

export const McpModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const navigate = useNavigate()

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

  return createPortal(
    <div
      className="mcp-modal lb-chrome"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-modal-title"
    >
      <button type="button" className="mcp-modal-scrim" aria-label="Close" onClick={onClose} />

      <div className="mcp-modal-card">
        <div className="mcp-modal-head">
          <div className="mcp-modal-head-copy">
            <p className="lb-chy">MCP · API</p>
            <h2 id="mcp-modal-title">Set up your AI agent</h2>
          </div>
          <button type="button" className="mcp-modal-x" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.9} aria-hidden />
          </button>
        </div>

        <div className="mcp-modal-body">
          <McpSettingsPanel
            showHeading={false}
            openApi={() => {
              onClose()
              navigate('/api-keys')
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
