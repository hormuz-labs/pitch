import { ArrowUp, ChevronDown, Paperclip, Plus, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditPopover } from '../components/CreditPopover'
import { UrlAuthPrompt } from '../components/UrlAuthPrompt'
import { useBrowserProfile } from '../hooks/useBrowserProfile'
import { usePromptUrl } from '../hooks/usePromptUrl'
import { isAuthenticatedFor } from '../lib/authOrigins'
import { type StudioModel, studio } from './client'
import type { ProjectStore, Target } from './useProject'

const fmtTime = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function getTargetSuggestions(targets: Target[], scope: string | null): string[] {
  const t = targets[0]
  const tag = (t?.tagName ?? '').toLowerCase()
  const txt = (t?.text ?? scope ?? '').toLowerCase()

  if (tag === 'sfx' || txt.includes('sfx') || txt.includes('whoosh') || txt.includes('chime')) {
    return [
      'Make this SFX louder (+3dB)',
      'Shift 0.2s earlier',
      'Replace sound effect',
      'Remove this SFX',
    ]
  }
  if (tag === 'music' || txt.includes('music') || txt.includes('bgm')) {
    return [
      'Lower music volume to 50%',
      'Duck music more under voice',
      'Fade out music at the end',
      'Change background music',
    ]
  }
  if (
    tag === 'voiceover' ||
    tag === 'voice' ||
    txt.includes('voice') ||
    txt.includes('voiceover')
  ) {
    return [
      'Regenerate voice with more energy',
      'Speed up voice narration by 1.1x',
      'Shorten this sentence for faster pacing',
      'Change narrator tone',
    ]
  }
  if (tag === 'scene' || t?.sceneId || scope) {
    return [
      'Add a subtle camera zoom-in',
      'Shorten scene by 1s',
      'Speed up cut transition',
      'Change background theme',
    ]
  }
  return []
}

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
  const [dismissedAuthUrl, setDismissedAuthUrl] = useState<string | null>(null)
  const [models, setModels] = useState<StudioModel[]>([])
  const [defaultModel, setDefaultModel] = useState<string | null>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const modelRef = useRef<HTMLDivElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const browserProfile = useBrowserProfile()
  const scope = fmtScope(s)
  const promptUrl = usePromptUrl(s.draft)
  const suggestAuthentication =
    !!promptUrl &&
    promptUrl !== dismissedAuthUrl &&
    !browserProfile.loading &&
    !isAuthenticatedFor(promptUrl, browserProfile.origins)

  useEffect(() => {
    if (!s.id) return
    const key = `pitch:project-auth-draft:${s.id}`
    const savedDraft = sessionStorage.getItem(key)
    if (!savedDraft) return
    s.setDraft(savedDraft)
    sessionStorage.removeItem(key)
  }, [s.id, s.setDraft])

  // The picker's job is to show and override; until the user picks, the turn
  // runs on the project's stored model or the server default (s.model stays
  // null and nothing is sent).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await studio.models(await s.getToken())
        if (cancelled) return
        setModels(res.models)
        setDefaultModel(res.default)
      } catch {
        // Without the list there is no picker; the server default still runs.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [s.getToken])

  useEffect(() => {
    if (!modelOpen) return
    const close = (e: MouseEvent) => {
      if (!modelRef.current?.contains(e.target as Node)) setModelOpen(false)
    }
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [modelOpen])

  const activeModel = s.model ?? defaultModel

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

  const suggestions = getTargetSuggestions(s.targets, scope)

  return (
    <div className="job-composer">
      <div className="job-composer-box">
        {s.targets.length > 0 && (
          <div className="target-row">
            {s.targets.map(t => (
              <div key={t.ref} className="element-chip" title={t.selector}>
                <span className="element-chip-ref">{t.ref}</span>
                <span className="element-chip-tag">
                  {t.page
                    ? `page ${t.page}`
                    : typeof t.time === 'number'
                      ? typeof t.endTime === 'number' && t.endTime > t.time
                        ? `${fmtTime(t.time)}–${fmtTime(t.endTime)}`
                        : fmtTime(t.time)
                      : t.tagName}
                  {!t.page && typeof t.time !== 'number' && t.className
                    ? `.${t.className.split(' ')[0]}`
                    : ''}
                </span>
                {t.text && <span className="element-chip-text">“{t.text}”</span>}
                {/* A page names its file; a slide or scene names where in the
                    artifact it sits. Never both — "page slide 4" is nonsense. */}
                {t.page ? (
                  <span className="element-chip-scene">{t.asset?.split('/').pop()}</span>
                ) : t.slide ? (
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
                <span className="element-chip-text">
                  <Paperclip
                    size={11}
                    strokeWidth={2}
                    style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }}
                  />
                  {f.name}
                </span>
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
        {suggestAuthentication && promptUrl && (
          <UrlAuthPrompt
            url={promptUrl}
            onContinuePublicly={() => setDismissedAuthUrl(promptUrl)}
            onAuthenticate={() => {
              const projectId = s.id
              if (!projectId) return
              sessionStorage.setItem(`pitch:project-auth-draft:${projectId}`, s.draft)
              navigate(
                `/sessions?url=${encodeURIComponent(promptUrl)}&from=project&project=${encodeURIComponent(projectId)}`,
              )
            }}
          />
        )}
        {suggestions.length > 0 && (
          <div className="composer-suggestions">
            {suggestions.map(sugg => (
              <button
                key={sugg}
                type="button"
                className="suggestion-pill"
                onClick={() => {
                  s.setDraft(sugg)
                  s.composerRef?.current?.focus()
                }}
              >
                {sugg}
              </button>
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
          <div className="job-composer-tools">
            <button
              type="button"
              className="job-attach-plus"
              disabled={uploading}
              aria-label="Attach files"
              title="Attach files (PDF, images, video)"
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? <span className="spinner" /> : <Plus size={18} />}
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
          </div>
          <div className="job-composer-actions">
            {/* The balance belongs next to the thing that spends it. */}
            <span className="composer-credits">
              <CreditPopover variant="marker" />
            </span>
            {models.length > 0 && (
              <div className="model-select" ref={modelRef}>
                <button
                  type="button"
                  className="model-btn"
                  onClick={() => setModelOpen(open => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={modelOpen}
                  title="Choose the model"
                >
                  <span>{models.find(m => m.spec === activeModel)?.label ?? 'Model'}</span>
                  <ChevronDown size={12} />
                </button>
                {modelOpen && (
                  <div
                    className="model-menu"
                    role="listbox"
                    aria-label="Models"
                    data-lenis-prevent
                    onWheel={e => e.stopPropagation()}
                  >
                    {models.map(m => (
                      <button
                        key={m.spec}
                        type="button"
                        role="option"
                        aria-selected={m.spec === activeModel}
                        className={`model-option${m.spec === activeModel ? ' is-active' : ''}`}
                        onClick={() => {
                          s.setModel(m.spec)
                          setModelOpen(false)
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* While the agent is working, the button that sends is the button
                that stops. Keep both actions in the same stable position. */}
            {s.busy ? (
              <button
                type="button"
                className="job-send-round stop"
                aria-label="Stop the agent"
                title="Stop the agent"
                onClick={() => void s.stop()}
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="job-send-round"
                disabled={uploading || !s.draft.trim()}
                aria-label={sendLabel}
                title={sendLabel}
                onClick={() => void send()}
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
