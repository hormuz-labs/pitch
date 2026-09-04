/**
 * The browser the demo agent is driving, live over noVNC through the
 * studio's manager proxy (/browser/profiles/:id/vnc). View-only: the agent
 * owns the mouse.
 */
import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../../config'
import type { ProjectStore } from '../useProject'

function vncProxyUrl(profileId: string, token: string): string {
  const path = `/browser/profiles/${profileId}/vnc?token=${encodeURIComponent(token)}`
  if (API_URL.startsWith('http')) return API_URL.replace(/^http/, 'ws') + path
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${API_URL}${path}`
}

export function BrowserPreview({ store, profileId }: { store: ProjectStore; profileId: string }) {
  const s = store
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')

  useEffect(() => {
    let active = true
    let rfb: any = null
    ;(async () => {
      if (!containerRef.current) return
      try {
        const token = await s.getToken()
        if (!active) return
        const RFBModule: any = await import('@novnc/novnc')
        const RFB = RFBModule.default
        if (!active || !containerRef.current) return
        rfb = new RFB(containerRef.current, vncProxyUrl(profileId, token), { wsProtocols: ['binary'] })
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfb.viewOnly = true
        rfb.showDotCursor = true
        rfb.addEventListener('connect', () => active && setStatus('connected'))
        rfb.addEventListener('disconnect', () => active && setStatus('disconnected'))
        rfb.addEventListener('securityfailure', () => active && setStatus('error'))
      } catch {
        if (active) setStatus('error')
      }
    })()
    return () => {
      active = false
      try {
        rfb?.disconnect()
      } catch {
        /* ignore */
      }
    }
  }, [profileId, s.getToken])

  return (
    <div className="browser-preview">
      <div ref={containerRef} className="browser-preview-screen" />
      <div className="preview-updating">
        <span className="spinner" /> {status === 'connected' ? `Recording · ${s.status}` : status === 'connecting' ? 'Connecting to the browser…' : status === 'error' ? 'Could not connect to the browser' : 'Browser closed'}
      </div>
    </div>
  )
}
