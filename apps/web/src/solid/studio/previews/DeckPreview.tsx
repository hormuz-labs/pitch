import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { ProjectStore } from '../useProject'
import { InspectButton, SelectToggle } from './HtmlPreview'
export function DeckPreview(props: { store: ProjectStore; src: string }) {
  const s = props.store
  let frame: HTMLIFrameElement | undefined, container: HTMLDivElement | undefined
  const [scale, setScale] = createSignal(0.5),
    [ready, setReady] = createSignal(false),
    [loadVersion, setLoadVersion] = createSignal(0),
    [height, setHeight] = createSignal(720)
  const post = (m: unknown) => frame?.contentWindow?.postMessage(m, '*'),
    resize = () => {
      const r = container?.parentElement?.getBoundingClientRect()
      if (r) {
        setScale(Math.min(1, r.width / 1280))
        setHeight(r.height)
      }
    }
  createEffect(() => {
    loadVersion()
    if (ready()) post({ type: 'studio_toggle_inspect', enabled: s.inspectMode, scale: scale() })
  })
  createEffect(() => {
    loadVersion()
    if (ready())
      post({ type: 'studio_set_marks', marks: s.targets.map(t => t.mark).filter(x => x != null) })
  })
  createEffect(() => {
    loadVersion()
    if (ready() && s.selectedSlide) post({ type: 'studio_scroll_to', index: s.selectedSlide })
  })
  onMount(() => {
    resize()
    const ro = new ResizeObserver(resize)
    if (container?.parentElement) ro.observe(container.parentElement)
    const msg = (e: MessageEvent) => {
      if (e.source === frame?.contentWindow && e.data?.type === 'studio_element_selected')
        s.addTarget(e.data.element)
    }
    const key = (e: KeyboardEvent) => {
      if (/input|textarea/i.test(document.activeElement?.tagName ?? '')) return
      if (/^i$/i.test(e.key)) s.setInspectMode(!s.inspectMode)
      else if (e.key === 'Escape') s.setInspectMode(false)
    }
    addEventListener('message', msg)
    addEventListener('keydown', key)
    onCleanup(() => {
      ro.disconnect()
      removeEventListener('message', msg)
      removeEventListener('keydown', key)
    })
  })
  const toggle = () => s.setInspectMode(!s.inspectMode)
  return (
    <div
      ref={container}
      class={`deck-preview${s.inspectMode ? ' inspect-active' : ''}`}
      style={{ width: `${1280 * scale()}px`, height: `${height()}px` }}
    >
      <div
        class="deck-preview-viewport"
        style={{ width: `${1280 * scale()}px`, height: `${height()}px` }}
      >
        <iframe
          ref={frame}
          src={props.src}
          title="Deck preview"
          onLoad={() => {
            setReady(true)
            setLoadVersion(value => value + 1)
          }}
          style={{
            width: '1280px',
            height: `${height() / scale()}px`,
            transform: `scale(${scale()})`,
            'transform-origin': '0 0',
            border: '0',
            background: '#fff',
          }}
        />
      </div>
      <SelectToggle active={s.inspectMode} onClick={toggle} />
      <Show when={s.inspectMode}>
        <div class="preview-inspect-banner">
          <span class="preview-inspect-pulse" />
          Click anything on a slide to add it to your prompt · <kbd>esc</kbd>
        </div>
      </Show>
      <Show when={s.busy}>
        <div class="preview-updating">
          <span class="spinner" /> {s.status}
        </div>
      </Show>
      <div class="deck-preview-toolbar">
        <InspectButton active={s.inspectMode} onClick={toggle} />
      </div>
    </div>
  )
}
