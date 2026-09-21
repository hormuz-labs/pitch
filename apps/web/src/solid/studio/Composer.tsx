import { useNavigate } from '@solidjs/router'
import { ArrowUp, ChevronDown, Plus, Square } from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { firstUrlInText, isAuthenticatedFor } from '../../lib/authOrigins'
import { ModelCatalog } from '../account/ModelCatalog'
import { ComposerShell } from '../common/ComposerShell'
import { CreditMarker } from './CreditMarker'
import { studio } from './client'
import { modelMenuLeft } from './modelMenuPosition'
import { PendingMessages } from './PendingMessages'
import type { Target } from './types'
import { UrlAuthSuggestion } from './UrlAuthSuggestion'
import { useBrowserProfile } from './useBrowserProfile'
import type { ProjectStore } from './useProject'

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const scope = (s: ProjectStore) => {
  if (s.selectedSlide) return `slide ${s.selectedSlide}`
  if (!s.selectedScene) return null
  const sc = s.project?.description.scenes?.find(x => x.id === s.selectedScene)
  return !sc || !s.selectedScene.startsWith('beat-')
    ? s.selectedScene
    : sc.label
      ? `moment ${sc.index} — “${sc.label}”`
      : `moment ${sc.index}`
}
function suggestions(targets: Target[], where: string | null) {
  const t = targets[0],
    tag = t?.tagName?.toLowerCase(),
    txt = (t?.text ?? where ?? '').toLowerCase()
  if (tag === 'sfx' || /sfx|whoosh|chime/.test(txt))
    return [
      'Make this SFX louder (+3dB)',
      'Shift 0.2s earlier',
      'Replace sound effect',
      'Remove this SFX',
    ]
  if (tag === 'music' || /music|bgm/.test(txt))
    return [
      'Lower music volume to 50%',
      'Duck music more under voice',
      'Fade out music at the end',
      'Change background music',
    ]
  if (tag === 'voiceover' || tag === 'voice' || /voice/.test(txt))
    return [
      'Regenerate voice with more energy',
      'Speed up voice narration by 1.1x',
      'Shorten this sentence for faster pacing',
      'Change narrator tone',
    ]
  if (tag === 'scene' || t?.sceneId || where)
    return [
      'Add a subtle camera zoom-in',
      'Shorten scene by 1s',
      'Speed up cut transition',
      'Change background theme',
    ]
  return []
}
export function Composer(props: { store: ProjectStore }) {
  const s = props.store,
    [files, setFiles] = createSignal<File[]>([]),
    [uploading, setUploading] = createSignal(false),
    [dismissed, setDismissed] = createSignal<string | null>(null),
    [models, setModels] = createSignal<
      {
        spec: string
        label: string
        creditMultiplier: number
        estimatedCredits: number
      }[]
    >([]),
    [defaultModel, setDefaultModel] = createSignal<string | null>(null),
    [modelOpen, setModelOpen] = createSignal(false),
    [modelPosition, setModelPosition] = createSignal({ left: 12, bottom: 12 }),
    [promptUrl, setPromptUrl] = createSignal<string | null>(null),
    [stopping, setStopping] = createSignal(false),
    [stopError, setStopError] = createSignal<string | null>(null)
  let modelEl: HTMLDivElement | undefined,
    modelMenuEl: HTMLDivElement | undefined,
    fileInput: HTMLInputElement | undefined,
    timer = 0
  const navigate = useNavigate(),
    profile = useBrowserProfile()
  createEffect(() => {
    clearTimeout(timer)
    const candidate = firstUrlInText(s.draft)
    timer = window.setTimeout(() => setPromptUrl(candidate), 320)
  })
  onCleanup(() => clearTimeout(timer))
  onMount(() => {
    const saved = s.id && sessionStorage.getItem(`pitch:project-auth-draft:${s.id}`)
    if (saved) {
      s.setDraft(saved)
      sessionStorage.removeItem(`pitch:project-auth-draft:${s.id}`)
    }
    void s
      .getToken()
      .then(token => studio.models(token))
      .then(r => {
        setModels(r.models)
        setDefaultModel(r.default)
      })
      .catch(() => {})
    const doc = (e: MouseEvent) =>
      modelEl &&
      !modelEl.contains(e.target as Node) &&
      !modelMenuEl?.contains(e.target as Node) &&
      setModelOpen(false)
    document.addEventListener('mousedown', doc)
    onCleanup(() => document.removeEventListener('mousedown', doc))
  })
  const authHint = () =>
    !!promptUrl() &&
    promptUrl() !== dismissed() &&
    !profile.loading() &&
    !isAuthenticatedFor(promptUrl(), profile.origins())
  const selectedModel = () => models().find(m => m.spec === (s.model ?? defaultModel()))
  const activeModelLabel = () => {
    const spec = s.activeModel ?? s.model ?? defaultModel()
    if (!spec) return 'Model'
    return (
      models().find(model => model.spec === spec)?.label ??
      spec
        .split('/')
        .at(-1)!
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    )
  }
  const send = async (delivery?: 'queue' | 'steer') => {
    const text = s.draft.trim()
    if (!text || uploading()) return
    let uploads
    if (files().length) {
      setUploading(true)
      try {
        uploads = await s.upload(files())
      } catch (e: any) {
        setUploading(false)
        s.setDraft(text)
        alert(`Upload failed: ${e?.message ?? e}`)
        return
      }
      setUploading(false)
      setFiles([])
    }
    await s.send(text, { uploads, delivery })
  }
  const stop = async () => {
    if (stopping()) return
    setStopping(true)
    setStopError(null)
    try {
      if (!(await s.stop())) setStopError('No active generation was found. Refresh and try again.')
    } catch (error: any) {
      setStopError(error?.message ?? 'Could not stop generation')
    } finally {
      setStopping(false)
    }
  }
  const where = () => scope(s),
    placeholder = () =>
      s.targets.length
        ? 'Describe what should change for [1], [2]…'
        : where()
          ? `What should change in ${where()}?`
          : s.busy
            ? 'Add a follow-up…'
            : s.entries.length
              ? 'Ask for a change…'
              : 'Describe what you want…'
  return (
    <div class="job-composer">
      <PendingMessages entries={s.entries} busy={s.busy} onSteer={s.steerQueued} />
      <ComposerShell
        class="job-composer-box"
        footerClass="job-composer-footer"
        leadingClass="job-composer-tools"
        trailingClass="job-composer-actions"
        leading={
          <>
            <button
              class="job-attach-plus"
              disabled={uploading()}
              onClick={() => fileInput?.click()}
              aria-label="Attach files"
            >
              {uploading() ? <span class="spinner" /> : <Plus size={18} />}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={e => setFiles(v => [...v, ...Array.from(e.currentTarget.files ?? [])])}
            />
            <CreditMarker store={s} />
          </>
        }
        trailing={
          <>
            <Show when={s.busy}>
              <span
                class="active-model-indicator"
                aria-label={`Currently processing with ${activeModelLabel()}`}
                title={`Currently processing with ${activeModelLabel()}`}
              >
                <span class="spinner" aria-hidden="true" />
                <span>{activeModelLabel()}</span>
              </span>
            </Show>
            <Show when={!s.busy && models().length}>
              <div class="model-select" ref={modelEl}>
                <button
                  class="model-btn"
                  onClick={() => {
                    if (modelOpen()) {
                      setModelOpen(false)
                      return
                    }
                    const rect = modelEl?.getBoundingClientRect()
                    if (rect) {
                      const viewport = window.visualViewport
                      setModelPosition({
                        left: modelMenuLeft(
                          rect,
                          viewport?.width ?? window.innerWidth,
                          viewport?.offsetLeft ?? 0,
                        ),
                        bottom: Math.max(12, window.innerHeight - rect.top + 6),
                      })
                    }
                    setModelOpen(true)
                  }}
                  aria-label="Choose model"
                  aria-haspopup="listbox"
                  aria-expanded={modelOpen()}
                >
                  <span>{selectedModel()?.label ?? 'Model'}</span>
                  <ChevronDown size={12} />
                </button>
                <Show when={modelOpen()}>
                  <Portal>
                    <div
                      ref={modelMenuEl}
                      class="model-menu model-menu--catalog is-portal"
                      role="listbox"
                      style={{
                        left: `${modelPosition().left}px`,
                        bottom: `${modelPosition().bottom}px`,
                      }}
                    >
                      <ModelCatalog
                        models={models()}
                        selected={s.model ?? defaultModel()}
                        itemRole="option"
                        onSelect={spec => {
                          s.setModel(spec)
                          setModelOpen(false)
                        }}
                      />
                    </div>
                  </Portal>
                </Show>
              </div>
            </Show>
            <Show when={!s.busy || s.draft.trim()}>
              <button
                class="job-send-round"
                disabled={uploading() || !s.draft.trim()}
                onClick={() => void send(s.busy ? 'queue' : undefined)}
                aria-label={s.busy ? 'Queue message' : 'Send message'}
                title={s.busy ? 'Queue after current work' : undefined}
              >
                <ArrowUp size={17} />
              </button>
            </Show>
            <Show when={s.busy}>
              <button
                class="job-stop-task job-send-round"
                disabled={stopping()}
                onClick={() => void stop()}
                aria-label="Stop generation"
                aria-busy={stopping()}
                title={stopping() ? 'Stopping generation…' : 'Stop generation'}
              >
                <Square size={11} fill="currentColor" aria-hidden="true" />
              </button>
            </Show>
          </>
        }
      >
        <Show when={s.targets.length}>
          <div class="target-row">
            <For each={s.targets}>
              {t => (
                <div class="element-chip" title={t.selector}>
                  <span class="element-chip-ref">{t.ref}</span>
                  <span class="element-chip-tag">
                    {t.page
                      ? `page ${t.page}`
                      : typeof t.time === 'number'
                        ? typeof t.endTime === 'number' && t.endTime > t.time
                          ? `${fmt(t.time)}–${fmt(t.endTime)}`
                          : fmt(t.time)
                        : t.tagName}
                  </span>
                  <Show when={t.text}>
                    <span class="element-chip-text">“{t.text}”</span>
                  </Show>
                  <button class="scene-chip-clear" onClick={() => s.removeTarget(t.ref)}>
                    ×
                  </button>
                </div>
              )}
            </For>
            <Show when={s.targets.length > 1}>
              <button class="target-clear" onClick={s.clearTargets}>
                clear all
              </button>
            </Show>
          </div>
        </Show>
        <Show when={where() && !s.targets.length}>
          <div class="scene-chip">
            editing <strong>{where()}</strong>
            <button
              class="scene-chip-clear"
              onClick={() => {
                s.setSelectedScene(null)
                s.setSelectedSlide(null)
              }}
            >
              ×
            </button>
          </div>
        </Show>
        <Show when={files().length}>
          <div class="target-row">
            <For each={files()}>
              {(f, i) => (
                <div class="element-chip">
                  <span class="element-chip-text">{f.name}</span>
                  <button
                    class="scene-chip-clear"
                    onClick={() => setFiles(v => v.filter((_, j) => j !== i()))}
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={authHint() && promptUrl()}>
          {url => (
            <UrlAuthSuggestion
              url={url()}
              onPublic={() => setDismissed(url())}
              onClose={() => setDismissed(url())}
              onAuthenticate={() => {
                if (!s.id) return
                sessionStorage.setItem(`pitch:project-auth-draft:${s.id}`, s.draft)
                navigate(
                  `/sessions?url=${encodeURIComponent(url())}&from=project&project=${encodeURIComponent(s.id)}`,
                )
              }}
            />
          )}
        </Show>
        <Show when={suggestions(s.targets, where()).length}>
          <div class="composer-suggestions">
            <For each={suggestions(s.targets, where())}>
              {x => (
                <button
                  class="suggestion-pill"
                  onClick={() => {
                    s.setDraft(x)
                    s.composerRef.current?.focus()
                  }}
                >
                  {x}
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={stopError()}>
          <div class="composer-stop-error" role="alert">
            {stopError()}
          </div>
        </Show>
        <textarea
          ref={el => {
            s.composerRef.current = el
          }}
          rows={3}
          placeholder={placeholder()}
          value={s.draft}
          onInput={e => s.setDraft(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(s.busy && (e.metaKey || e.ctrlKey) ? 'steer' : 'queue')
            }
          }}
        />
      </ComposerShell>
    </div>
  )
}
