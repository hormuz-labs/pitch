import { Maximize, Minimize } from 'lucide-solid'
import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { API_URL } from '../../config'
import { useAuth } from '../core/auth'
export const vncProxyUrl = (id: string, token: string) => {
  const path = `/browser/profiles/${id}/vnc?token=${encodeURIComponent(token)}`
  if (API_URL.startsWith('http')) return API_URL.replace(/^http/, 'ws') + path
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${API_URL}${path}`
}
export function BrowserViewer(props: {
  profileId: string
  viewOnly?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (e: unknown) => void
}) {
  const auth = useAuth()
  let container: HTMLDivElement | undefined, wrapper: HTMLDivElement | undefined, rfb: any
  const [status, setStatus] = createSignal<
      'authenticating' | 'connecting' | 'connected' | 'disconnected' | 'error'
    >('connecting'),
    [fullscreen, setFullscreen] = createSignal(false)
  const fs = () => {
    if (!wrapper) return
    if (!document.fullscreenElement) void wrapper.requestFullscreen?.().catch(() => {})
    else void document.exitFullscreen?.().catch(() => {})
  }
  const fsc = () => setFullscreen(!!document.fullscreenElement)
  document.addEventListener('fullscreenchange', fsc)
  onCleanup(() => document.removeEventListener('fullscreenchange', fsc))
  createEffect(() => {
    const id = props.profileId
    let active = true
    ;(async () => {
      try {
        setStatus('authenticating')
        const token = await auth.getToken()
        if (!token) throw new Error('Not signed in')
        setStatus('connecting')
        const RFB = (await import('@novnc/novnc')).default
        if (!active || !container) return
        rfb = new RFB(container, vncProxyUrl(id, token), { wsProtocols: ['binary'] })
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfb.viewOnly = !!props.viewOnly
        rfb.showDotCursor = true
        rfb.addEventListener('connect', () => {
          if (active) {
            setStatus('connected')
            props.onConnect?.()
          }
        })
        rfb.addEventListener('disconnect', () => {
          if (active) {
            setStatus('disconnected')
            props.onDisconnect?.()
          }
        })
        rfb.addEventListener('securityfailure', (e: any) => {
          if (active) {
            setStatus('error')
            props.onError?.(e.detail?.reason)
          }
        })
      } catch (e) {
        if (active) {
          setStatus('error')
          props.onError?.(e)
        }
      }
    })()
    onCleanup(() => {
      active = false
      try {
        rfb?.disconnect()
      } catch {}
      rfb = null
    })
  })
  return (
    <div
      ref={wrapper}
      class="relative w-full h-full bg-black flex flex-col overflow-hidden rounded-lg group"
    >
      <Show when={status() === 'connected'}>
        <button
          onClick={fs}
          class="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/40 text-white"
        >
          <Show when={fullscreen()} fallback={<Maximize size={14} />}>
            <Minimize size={14} />
          </Show>
          {fullscreen() ? 'Exit full screen' : 'Full screen'}
        </button>
      </Show>
      <div
        ref={container}
        class="flex-1 w-full h-full overflow-hidden"
        style={{ 'min-height': '0' }}
      />
      <Show when={status() === 'connecting' || status() === 'authenticating'}>
        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/80">
          <span class="spinner" /> {status() === 'authenticating' ? 'Authenticating…' : 'Linking…'}
        </div>
      </Show>
    </div>
  )
}
