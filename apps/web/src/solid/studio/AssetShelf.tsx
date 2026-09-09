import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
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
          <div class="asset-viewer-box" onClick={e => e.stopPropagation()}>
            <div class="asset-viewer-head">
              <span class="asset-viewer-name" title={props.asset.path}>
                {props.asset.name}
              </span>
              <span class="asset-viewer-meta">
                {props.asset.path} · {size(props.asset.size)}
              </span>
              <button class="asset-viewer-close" onClick={props.close}>
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
                            <img src={u()} alt={props.asset.name} />
                          </Show>
                        }
                      >
                        <audio src={u()} controls autoplay />
                      </Show>
                    }
                  >
                    <video src={u()} controls autoplay preload="metadata" />
                  </Show>
                )}
              </Show>
            </div>
            <div class="asset-viewer-foot">
              <button class="viewer-btn primary" onClick={reference}>
                Use in chat
              </button>
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
              <button class="viewer-btn danger" disabled={busy()} onClick={() => void remove()}>
                {busy() ? 'Deleting…' : 'Delete'}
              </button>
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
      <button
        class="asset-ref"
        title={props.picked ? 'Already referenced' : 'Reference this file in your next message'}
        onClick={reference}
      >
        {props.picked ? '✓' : '+'}
      </button>
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
        if (!e.dataTransfer?.files.length) return
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
        <button class="asset-add" disabled={adding()} onClick={() => input?.click()}>
          {adding() ? 'Adding…' : '+ Add'}
        </button>
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
