import { Maximize, Minus, Plus } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { AudioPlayer } from './AudioPlayer'
import type { Asset } from './types'
import type { ProjectStore } from './useProject'

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a,.aac,.ogg'
const GLYPH: Record<string, string> = { image: '▣', video: '▶', audio: '♪', pdf: '❐', other: '◇' },
  ORIGIN: Record<string, string> = {
    upload: 'yours',
    generated: 'made here',
    harvested: 'from the site',
  }
const size = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`

function ZoomableImage(props: { src: string; name: string }) {
  let viewport!: HTMLDivElement
  const [natural, setNatural] = createSignal({ width: 0, height: 0 })
  const [bounds, setBounds] = createSignal({ width: 1, height: 1 })
  const [mode, setMode] = createSignal<'fit' | 'width' | 'custom'>('fit')
  const [customScale, setCustomScale] = createSignal(1)
  const [dragging, setDragging] = createSignal(false)
  const pointers = new Map<number, { x: number; y: number }>()
  const gesture = () => {
    const points = [...pointers.values()]
    if (!points.length) return
    const first = points[0],
      second = points[1] ?? first
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      distance: Math.hypot(first.x - second.x, first.y - second.y),
    }
  }
  const scale = createMemo(() => {
    const image = natural(),
      box = bounds()
    if (!image.width) return 1
    if (mode() === 'custom') return customScale()
    return Math.min(
      1,
      box.width / image.width,
      mode() === 'fit' ? box.height / image.height : Infinity,
    )
  })
  const zoom = (
    value: number,
    x = viewport.clientWidth / 2,
    y = viewport.clientHeight / 2,
    panX = 0,
    panY = 0,
  ) => {
    const previous = scale(),
      image = natural()
    if (!image.width) return
    const oldLeft = Math.max(0, (viewport.clientWidth - image.width * previous) / 2)
    const oldTop = Math.max(0, (viewport.clientHeight - image.height * previous) / 2)
    const imageX = (viewport.scrollLeft + x - oldLeft) / previous
    const imageY = (viewport.scrollTop + y - oldTop) / previous
    const next = Math.min(6, Math.max(0.01, value))
    setCustomScale(next)
    setMode('custom')
    viewport.scrollLeft =
      imageX * next + Math.max(0, (viewport.clientWidth - image.width * next) / 2) - x - panX
    viewport.scrollTop =
      imageY * next + Math.max(0, (viewport.clientHeight - image.height * next) / 2) - y - panY
  }
  const fit = (value: 'fit' | 'width') => {
    setMode(value)
    viewport.scrollTo(0, 0)
  }
  const pointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    setDragging(pointers.size > 0)
  }
  onMount(() => {
    const observer = new ResizeObserver(() =>
      setBounds({ width: viewport.clientWidth, height: viewport.clientHeight }),
    )
    observer.observe(viewport)
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      zoom(
        scale() * Math.exp(-event.deltaY * 0.01),
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
    }
    viewport.addEventListener('wheel', wheel, { passive: false })
    onCleanup(() => {
      observer.disconnect()
      viewport.removeEventListener('wheel', wheel)
    })
  })
  return (
    <div class="asset-image-viewer">
      <div class="asset-zoom-toolbar" role="toolbar" aria-label="Image zoom">
        <button
          onClick={() => zoom(scale() / 1.25)}
          aria-label="Zoom out"
          disabled={scale() <= 0.01}
        >
          <Minus size={15} />
        </button>
        <output aria-live="polite">{Math.round(scale() * 100)}%</output>
        <button onClick={() => zoom(scale() * 1.25)} aria-label="Zoom in" disabled={scale() >= 6}>
          <Plus size={15} />
        </button>
        <button onClick={() => fit('fit')} aria-pressed={mode() === 'fit'} title="Fit image">
          <Maximize size={14} /> Fit
        </button>
        <button onClick={() => fit('width')} aria-pressed={mode() === 'width'}>
          Fit width
        </button>
        <button onClick={() => zoom(1)}>100%</button>
      </div>
      <div
        ref={viewport}
        class={`asset-image-viewport${dragging() ? ' is-dragging' : ''}`}
        tabIndex={0}
        role="region"
        aria-label="Image preview. Scroll to pan, or use Control plus scroll to zoom."
        onKeyDown={event => {
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            zoom(scale() * 1.25)
          }
          if (event.key === '-') {
            event.preventDefault()
            zoom(scale() / 1.25)
          }
          if (event.key === '0') {
            event.preventDefault()
            fit('fit')
          }
        }}
        onPointerDown={event => {
          if (event.button !== 0) return
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
          viewport.setPointerCapture(event.pointerId)
          setDragging(true)
        }}
        onPointerMove={event => {
          if (!pointers.has(event.pointerId)) return
          const previous = gesture()!
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
          const current = gesture()!
          if (pointers.size >= 2 && previous.distance > 0 && current.distance > 0) {
            const rect = viewport.getBoundingClientRect()
            zoom(
              scale() * (current.distance / previous.distance),
              previous.x - rect.left,
              previous.y - rect.top,
              current.x - previous.x,
              current.y - previous.y,
            )
          } else {
            viewport.scrollLeft -= current.x - previous.x
            viewport.scrollTop -= current.y - previous.y
          }
        }}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onLostPointerCapture={pointerUp}
        onDblClick={event => {
          if (mode() === 'custom') return fit('fit')
          const rect = viewport.getBoundingClientRect()
          zoom(scale() * 2, event.clientX - rect.left, event.clientY - rect.top)
        }}
      >
        <div
          class="asset-image-canvas"
          style={{
            width: `${natural().width * scale()}px`,
            height: `${natural().height * scale()}px`,
          }}
        >
          <img
            src={props.src}
            alt={props.name}
            style={{
              width: `${natural().width * scale()}px`,
              height: `${natural().height * scale()}px`,
            }}
            draggable={false}
            onLoad={event =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
function Viewer(props: { store: ProjectStore; asset: Asset; close: () => void }) {
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal<string | null>(null),
    src = () => props.store.mediaUrl(props.asset.url)
  const key = (e: KeyboardEvent) => e.key === 'Escape' && props.close()
  onMount(() => window.addEventListener('keydown', key))
  onCleanup(() => window.removeEventListener('keydown', key))
  const reference = () => {
    props.store.addTarget({
      sceneId: null,
      tagName: 'asset',
      className: '',
      id: '',
      text: props.asset.name,
      selector: props.asset.path,
      asset: props.asset.path,
      assetOrigin: props.asset.origin,
    })
    props.close()
  }
  const remove = async () => {
    if (!confirm(`Delete ${props.asset.name}? This removes the file from the project.`)) return
    setBusy(true)
    setError(null)
    try {
      await props.store.deleteAsset(props.asset.path)
      props.close()
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete it')
      setBusy(false)
    }
  }
  return (
    <Portal>
      <div class="lv-studio">
        <div class="asset-viewer" onClick={props.close}>
          <div
            class="asset-viewer-box"
            classList={{ 'asset-viewer-box--audio': props.asset.kind === 'audio' }}
            role="dialog"
            aria-modal="true"
            aria-label={props.asset.name}
            onClick={e => e.stopPropagation()}
          >
            <div class="asset-viewer-head">
              <span class="asset-viewer-name" title={props.asset.path}>
                {props.asset.name}
              </span>
              <span class="asset-viewer-meta">
                {props.asset.path} · {size(props.asset.size)}
              </span>
              <button
                type="button"
                class="asset-viewer-close"
                aria-label="Close asset preview"
                title="Close"
                onPointerDown={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  props.close()
                }}
                onClick={props.close}
              >
                ✕
              </button>
            </div>
            <div class="asset-viewer-body">
              <Show when={src()} fallback={<div class="asset-viewer-note">Loading…</div>}>
                {u => (
                  <Show
                    when={props.asset.kind === 'video'}
                    fallback={
                      <Show
                        when={props.asset.kind === 'audio'}
                        fallback={
                          <Show
                            when={props.asset.kind === 'image'}
                            fallback={
                              <Show
                                when={props.asset.kind === 'pdf'}
                                fallback={
                                  <div class="asset-viewer-note">
                                    Nothing to show for this kind of file.
                                  </div>
                                }
                              >
                                <iframe src={u()} title={props.asset.name} />
                              </Show>
                            }
                          >
                            <ZoomableImage src={u()} name={props.asset.name} />
                          </Show>
                        }
                      >
                        <AudioPlayer src={u()} />
                      </Show>
                    }
                  >
                    <video src={u()} controls autoplay preload="metadata" />
                  </Show>
                )}
              </Show>
            </div>
            <div class="asset-viewer-foot">
              <Show when={!props.store.readOnly}>
                <button class="viewer-btn primary" onClick={reference}>
                  Use in chat
                </button>
              </Show>
              <Show when={src()}>
                {u => (
                  <a class="viewer-btn" href={u()} download={props.asset.name}>
                    Download
                  </a>
                )}
              </Show>
              <Show when={error()}>
                <span class="asset-viewer-error">{error()}</span>
              </Show>
              <Show when={!props.store.readOnly}>
                <button class="viewer-btn danger" disabled={busy()} onClick={() => void remove()}>
                  {busy() ? 'Deleting…' : 'Delete'}
                </button>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
function Card(props: { store: ProjectStore; asset: Asset; picked: boolean; open: () => void }) {
  const [failed, setFailed] = createSignal(false),
    thumb = () => props.store.mediaUrl(props.asset.thumbUrl)
  const reference = () =>
    props.store.addTarget({
      sceneId: null,
      tagName: 'asset',
      className: '',
      id: '',
      text: props.asset.name,
      selector: props.asset.path,
      asset: props.asset.path,
      assetOrigin: ORIGIN[props.asset.origin] ?? props.asset.origin,
    })
  return (
    <div class={`asset-card${props.picked ? ' picked' : ''}`}>
      <button
        class="asset-open"
        title={`${props.asset.path} · ${size(props.asset.size)} — click to open`}
        onClick={props.open}
      >
        <span class="asset-thumb">
          <Show
            when={thumb() && !failed()}
            fallback={<span class="asset-glyph">{GLYPH[props.asset.kind]}</span>}
          >
            <img src={thumb()!} alt="" draggable="false" onError={() => setFailed(true)} />
          </Show>
          <Show when={props.asset.kind === 'video' || props.asset.kind === 'audio'}>
            <span class="asset-play">▶</span>
          </Show>
        </span>
        <span class="asset-lines">
          <span class="asset-name">{props.asset.name}</span>
          <span class="asset-meta">{ORIGIN[props.asset.origin] ?? props.asset.origin}</span>
        </span>
      </button>
      <Show when={!props.store.readOnly}>
        <button
          class="asset-ref"
          title={props.picked ? 'Already referenced' : 'Reference this file in your next message'}
          onClick={reference}
        >
          {props.picked ? '✓' : '+'}
        </button>
      </Show>
    </div>
  )
}
export function AssetShelf(props: { store: ProjectStore }) {
  const [dragging, setDragging] = createSignal(false),
    [adding, setAdding] = createSignal(false),
    [error, setError] = createSignal<string | null>(null),
    [open, setOpen] = createSignal<Asset | null>(null)
  let input: HTMLInputElement | undefined,
    depth = 0
  const chosen = () => new Set(props.store.targets.map(t => t.asset).filter(Boolean))
  const add = async (files: FileList | File[] | null) => {
    if (!files) return
    setAdding(true)
    setError(null)
    try {
      await props.store.addAssets(files)
    } catch (e: any) {
      setError(e?.message ?? 'Could not add those files')
    } finally {
      setAdding(false)
      if (input) input.value = ''
    }
  }
  return (
    <div
      class={`timeline asset-shelf${dragging() ? ' dropping' : ''}`}
      onDragEnter={e => {
        if (!e.dataTransfer?.types.includes('Files')) return
        depth++
        setDragging(true)
      }}
      onDragOver={e => e.dataTransfer?.types.includes('Files') && e.preventDefault()}
      onDragLeave={() => {
        depth = Math.max(0, depth - 1)
        if (!depth) setDragging(false)
      }}
      onDrop={e => {
        if (props.store.readOnly || !e.dataTransfer?.files.length) return
        e.preventDefault()
        depth = 0
        setDragging(false)
        void add(e.dataTransfer.files)
      }}
    >
      <div class="timeline-header">
        <h2>Assets</h2>
        <span class="timeline-meta">
          {props.store.assets.length
            ? `${props.store.assets.length} file${props.store.assets.length === 1 ? '' : 's'} · click to open, + to reference`
            : 'files this project can use'}
        </span>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept={ACCEPT}
          onChange={e => void add(e.currentTarget.files)}
        />
        <Show when={!props.store.readOnly}>
          <button class="asset-add" disabled={adding()} onClick={() => input?.click()}>
            {adding() ? 'Adding…' : '+ Add'}
          </button>
        </Show>
      </div>
      <Show when={error()}>
        <div class="timeline-empty asset-error">{error()}</div>
      </Show>
      <Show
        when={props.store.assets.length}
        fallback={
          <div class="timeline-empty">
            Nothing yet. Drop files here — or ask for something, and what gets made lands here too.
          </div>
        }
      >
        <div class="strip">
          <For each={props.store.assets}>
            {a => (
              <Card
                store={props.store}
                asset={a}
                picked={chosen().has(a.path)}
                open={() => setOpen(a)}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={open()} keyed>
        {a => <Viewer store={props.store} asset={a} close={() => setOpen(null)} />}
      </Show>
    </div>
  )
}
export { Viewer as AssetViewer }
