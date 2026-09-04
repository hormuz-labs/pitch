/**
 * The shelf — what the project has to work WITH.
 *
 * The stage shows the artifact. This shows the material: the file the user
 * dropped, the logo recon harvested, the clip the agent generated, anything
 * added mid-session. It sits under the stage next to the scene strip because
 * it answers the same kind of question — which thing do you mean?
 *
 * Clicking an asset is the same act as clicking an element or dragging a range
 * on the video track: it becomes a `[n]` chip in the composer. The chip's
 * value is the WORKSPACE-RELATIVE PATH, which is exactly what the agent's
 * tools take, so "use [1] as the first frame" needs no lookup in between.
 */
import { useRef, useState } from 'react'
import type { Asset } from './client'
import type { ProjectStore } from './useProject'

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a,.aac,.ogg'

const KIND_GLYPH: Record<string, string> = {
  image: '▣',
  video: '▶',
  audio: '♪',
  pdf: '❐',
  other: '◇',
}

/** Where it came from, in the fewest words that still distinguish them. */
const ORIGIN_LABEL: Record<string, string> = {
  upload: 'yours',
  generated: 'made here',
  harvested: 'from the site',
}

function size(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return `${bytes} B`
}

function AssetCard({
  store,
  asset,
  picked,
}: {
  store: ProjectStore
  asset: Asset
  picked: boolean
}) {
  const [failed, setFailed] = useState(false)
  const src = store.mediaUrl(asset.url)
  const showImage = asset.kind === 'image' && src && !failed

  return (
    <button
      type="button"
      className={`asset-card${picked ? ' picked' : ''}`}
      title={`${asset.path} · ${size(asset.size)}`}
      onClick={() =>
        store.addTarget({
          sceneId: null,
          tagName: 'asset',
          className: '',
          id: '',
          text: asset.name,
          selector: asset.path,
          asset: asset.path,
          assetOrigin: ORIGIN_LABEL[asset.origin] ?? asset.origin,
        })
      }
    >
      <span className="asset-thumb">
        {showImage ? (
          <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />
        ) : (
          <span className="asset-glyph">{KIND_GLYPH[asset.kind] ?? KIND_GLYPH.other}</span>
        )}
      </span>
      <span className="asset-name">{asset.name}</span>
      <span className="asset-meta">{ORIGIN_LABEL[asset.origin] ?? asset.origin}</span>
    </button>
  )
}

export function AssetShelf({ store }: { store: ProjectStore }) {
  const s = store
  const [dragging, setDragging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const depth = useRef(0)

  const chosen = new Set(s.targets.map(t => t.asset).filter(Boolean))

  const add = async (files: FileList | File[] | null) => {
    if (!files) return
    setAdding(true)
    setError(null)
    try {
      await s.addAssets(files)
    } catch (err: any) {
      setError(err?.message ?? 'Could not add those files')
    } finally {
      setAdding(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop zone is not a control
    <div
      className={`timeline asset-shelf${dragging ? ' dropping' : ''}`}
      onDragEnter={e => {
        if (!e.dataTransfer?.types.includes('Files')) return
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={e => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={e => {
        if (!e.dataTransfer?.files.length) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        void add(e.dataTransfer.files)
      }}
    >
      <div className="timeline-header">
        <h2>Assets</h2>
        <span className="timeline-meta">
          {s.assets.length > 0
            ? `${s.assets.length} file${s.assets.length === 1 ? '' : 's'} · click one to reference it`
            : 'files this project can use'}
        </span>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept={ACCEPT}
          onChange={e => void add(e.target.files)}
        />
        <button
          type="button"
          className="asset-add"
          disabled={adding}
          onClick={() => input.current?.click()}
        >
          {adding ? 'Adding…' : '+ Add'}
        </button>
      </div>

      {error && <div className="timeline-empty asset-error">{error}</div>}

      {s.assets.length === 0 ? (
        <div className="timeline-empty">
          Nothing yet. Drop files here — or ask for something, and what gets made lands here too.
        </div>
      ) : (
        <div className="strip">
          {s.assets.map(asset => (
            <AssetCard key={asset.path} store={s} asset={asset} picked={chosen.has(asset.path)} />
          ))}
        </div>
      )}
    </div>
  )
}
