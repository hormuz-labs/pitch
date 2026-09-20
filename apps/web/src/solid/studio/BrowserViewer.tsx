import { Maximize, Minimize } from 'lucide-solid'
import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { API_URL } from '../../config'
import { useAuth } from '../core/auth'

export const browserStreamUrl = (id: string, token: string) => {
  const path = `/browser/streams/${id}?token=${encodeURIComponent(token)}`
  if (API_URL.startsWith('http')) return API_URL.replace(/^http/, 'ws') + path
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${API_URL}${path}`
}

export function BrowserViewer(props: {
  streamId: string
  viewOnly?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (e: unknown) => void
}) {
  const auth = useAuth()
  let container: HTMLDivElement | undefined
  let wrapper: HTMLDivElement | undefined
  let rfb: import('@novnc/novnc').default | undefined
  const [status, setStatus] = createSignal<
    'authenticating' | 'connecting' | 'connected' | 'disconnected' | 'error'
  >('connecting')
  const [fullscreen, setFullscreen] = createSignal(false)
  const fs = () => {
    if (!wrapper) return
    if (!document.fullscreenElement) void wrapper.requestFullscreen?.().catch(() => {})
    else void document.exitFullscreen?.().catch(() => {})
  }
  const fsc = () => setFullscreen(!!document.fullscreenElement)
  document.addEventListener('fullscreenchange', fsc)
  onCleanup(() => document.removeEventListener('fullscreenchange', fsc))

  createEffect(() => {
    const id = props.streamId
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const connect = async () => {
      try {
        setStatus('authenticating')
        const token = await auth.getToken()
        if (!token) throw new Error('Not signed in')
        if (!active) return
        setStatus('connecting')
        const RFB = (await import('@novnc/novnc')).default
        if (!active || !container) return
        rfb = new RFB(container, browserStreamUrl(id, token), { wsProtocols: ['binary'] })
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfb.viewOnly = !!props.viewOnly
        rfb.showDotCursor = true
        rfb.addEventListener('connect', () => {
          if (!active) return
          attempts = 0
          setStatus('connected')
          props.onConnect?.()
        })
        rfb.addEventListener('disconnect', () => {
          if (!active) return
          setStatus('disconnected')
          props.onDisconnect?.()
          rfb = undefined
          retry = setTimeout(() => void connect(), Math.min(15_000, 1000 * 2 ** attempts++))
        })
        rfb.addEventListener('securityfailure', event => {
          if (!active) return
          setStatus('error')
          props.onError?.(event.detail?.reason)
        })
      } catch (error) {
        if (active) {
          setStatus('error')
          props.onError?.(error)
          retry = setTimeout(() => void connect(), Math.min(15_000, 1000 * 2 ** attempts++))
        }
      }
    }
    void connect()
    onCleanup(() => {
      active = false
      clearTimeout(retry)
      rfb?.disconnect()
      rfb = undefined
    })
  })

  return (
    <div
      ref={wrapper}
      class="relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-black group"
    >
      <div ref={container} class="h-full min-h-0 w-full flex-1 overflow-hidden" />
      <Show when={status() === 'connected'}>
        <button
          onClick={fs}
          class="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 bg-black/40 px-3 py-1.5 text-white"
        >
          <Show when={fullscreen()} fallback={<Maximize size={14} />}>
            <Minimize size={14} />
          </Show>
          {fullscreen() ? 'Exit full screen' : 'Full screen'}
        </button>
      </Show>
      <Show when={status() !== 'connected'}>
        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-white">
          <span class="spinner" />{' '}
          {status() === 'authenticating'
            ? 'Authenticating...'
            : status() === 'connecting'
              ? 'Linking...'
              : 'Disconnected'}
        </div>
      </Show>
    </div>
  )
}
