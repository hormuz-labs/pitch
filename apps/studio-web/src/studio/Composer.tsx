import { useRef, useState } from 'react'
import type { ProjectStore } from './useProject'

const fmtTime = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/**
 * What the prompt is currently scoped to. Launch shots carry their own name
 * ("hero"), but a video beat's id ("beat-3") means nothing to the user — show
 * the moment and what is said there instead.
 */
const fmtScope = (s: ProjectStore): string | null => {
  if (s.selectedSlide) return `slide ${s.selectedSlide}`
  if (!s.selectedScene) return null
  const scene = s.project?.description.scenes?.find(sc => sc.id === s.selectedScene)
  if (!scene || !s.selectedScene.startsWith('beat-')) return s.selectedScene
  return scene.label ? `moment ${scene.index} — “${scene.label}”` : `moment ${scene.index}`
}

/** The composer: target chips, scope chip, attachments, the textarea, send. */
export function Composer({ store }: { store: ProjectStore }) {
  const s = store
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const scope = fmtScope(s)

  const send = async () => {
    const text = s.draft.trim()
    if (!text || s.busy || uploading) return
    let uploads: Awaited<ReturnType<ProjectStore['upload']>> | undefined
    if (files.length) {
      setUploading(true)
      try {
        uploads = await s.upload(files)
      } catch (err: any) {
        setUploading(false)
        s.setDraft(text)
        alert(`Upload failed: ${err?.message ?? err}`)
        return
      }
      setUploading(false)
      setFiles([])
    }
    await s.send(text, { uploads })
  }

  const placeholder = s.targets.length
    ? 'Describe what should change for [1], [2]…'
    : scope
      ? `What should change in ${scope}?`
      : s.entries.length
        ? 'Ask for a change…'
        : 'Describe what you want…'
  const sendLabel = s.busy
    ? 'Working…'
    : uploading
      ? 'Uploading…'
      : s.targets.length > 1
        ? `Update ${s.targets.length} elements`
        : s.targets.length === 1
          ? 'Update element'
          : scope
            ? `Update ${scope}`
            : 'Send'

  return (
    <div className="job-composer">
      <div className="job-composer-box">
        {s.targets.length > 0 && (
          <div className="target-row">
            {s.targets.map(t => (
              <div key={t.ref} className="element-chip" title={t.selector}>
                <span className="element-chip-ref">{t.ref}</span>
                <span className="element-chip-tag">
                  {typeof t.time === 'number'
                    ? typeof t.endTime === 'number' && t.endTime > t.time
                      ? `${fmtTime(t.time)}–${fmtTime(t.endTime)}`
                      : fmtTime(t.time)
                    : t.tagName}
                  {typeof t.time !== 'number' && t.className ? `.${t.className.split(' ')[0]}` : ''}
                </span>
                {t.text && <span className="element-chip-text">“{t.text}”</span>}
                {t.slide ? (
                  <span className="element-chip-scene">slide {t.slide}</span>
                ) : t.sceneId && typeof t.time !== 'number' ? (
                  <span className="element-chip-scene">{t.sceneId}</span>
                ) : null}
                <button
                  className="scene-chip-clear"
                  title={`Remove [${t.ref}]`}
                  onClick={() => s.removeTarget(t.ref)}
                >
                  ×
                </button>
              </div>
            ))}
            {s.targets.length > 1 && (
              <button className="target-clear" onClick={s.clearTargets}>
                clear all
              </button>
            )}
          </div>
        )}
        {scope && s.targets.length === 0 && (
          <div className="scene-chip">
            editing <strong>{scope}</strong>
            <button
              className="scene-chip-clear"
              title="Target the whole project instead"
              onClick={() => {
                s.setSelectedScene(null)
                s.setSelectedSlide(null)
              }}
            >
              ×
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="target-row">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="element-chip" title={f.name}>
                <span className="element-chip-text">📎 {f.name}</span>
                <button
                  className="scene-chip-clear"
                  onClick={() => setFiles(list => list.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={s.composerRef}
          rows={3}
          placeholder={placeholder}
          value={s.draft}
          onChange={e => s.setDraft(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <div className="job-composer-footer">
          <span className="job-composer-hint">
            <button
              className="target-clear"
              title="Attach files (PDF, images, video)"
              onClick={() => fileInput.current?.click()}
            >
              📎 attach
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={e =>
                setFiles(list => [...list, ...Array.from(e.currentTarget.files ?? [])])
              }
            />
            {s.targets.length
              ? ' · Refer to elements as [1], [2]…'
              : ' · Enter to send · Shift+Enter for a new line'}
          </span>
          <button
            className="inspector-send"
            disabled={s.busy || uploading || !s.draft.trim()}
            onClick={() => void send()}
          >
            {sendLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
