import { A, useNavigate } from '@solidjs/router'
import { ArrowUp, ChevronDown, Globe2, LockKeyhole, Plus, Square, X } from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { firstUrlInText, isAuthenticatedFor, prettyHost } from '../../lib/authOrigins'
import { studio } from './client'
import type { Target } from './types'
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
function CreditMarker(props: { getToken: () => Promise<string> }) {
  const [credits, setCredits] = createSignal<number | null>(null),
    [open, setOpen] = createSignal(false)
  onMount(
    () =>
      void props
        .getToken()
        .then(t => fetch(`${API_URL}/credits`, { headers: { Authorization: `Bearer ${t}` } }))
        .then(r => (r.ok ? r.json() : null))
        .then(d => d && setCredits(d.balance))
        .catch(() => {}),
  )
  return (
    <span class="composer-credits">
      <button class="model-btn" aria-label="Credits" onClick={() => setOpen(v => !v)}>
        $ ◯
      </button>
      <Show when={open()}>
        <div class="model-menu" role="dialog">
          <div class="export-row-note">{credits() ?? '—'} credits available</div>
          <A class="model-option" href="/pricing">
            Manage credits
          </A>
        </div>
      </Show>
    </span>
  )
}
export function Composer(props: { store: ProjectStore }) {
  const s = props.store,
    [files, setFiles] = createSignal<File[]>([]),
    [uploading, setUploading] = createSignal(false),
    [dismissed, setDismissed] = createSignal<string | null>(null),
    [models, setModels] = createSignal<{ spec: string; label: string }[]>([]),
    [defaultModel, setDefaultModel] = createSignal<string | null>(null),
    [modelOpen, setModelOpen] = createSignal(false),
    [promptUrl, setPromptUrl] = createSignal<string | null>(null)
  let modelEl: HTMLDivElement | undefined,
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
      modelEl && !modelEl.contains(e.target as Node) && setModelOpen(false)
    document.addEventListener('mousedown', doc)
    onCleanup(() => document.removeEventListener('mousedown', doc))
  })
  const authHint = () =>
    !!promptUrl() &&
    promptUrl() !== dismissed() &&
    !profile.loading() &&
    !isAuthenticatedFor(promptUrl(), profile.origins())
  const send = async () => {
    const text = s.draft.trim()
    if (!text || s.busy || uploading()) return
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
    await s.send(text, { uploads })
  }
  const where = () => scope(s),
    placeholder = () =>
      s.targets.length
        ? 'Describe what should change for [1], [2]…'
        : where()
          ? `What should change in ${where()}?`
          : s.entries.length
            ? 'Ask for a change…'
            : 'Describe what you want…'
  return (
    <div class="job-composer">
      <div class="job-composer-box">
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
            <div class="url-auth-suggestion-slot">
              <section class="url-auth-suggestion">
                <span class="url-auth-suggestion__icon">
                  <LockKeyhole size={15} />
                </span>
                <div class="url-auth-suggestion__copy">
                  <strong>Does {prettyHost(url())} need a login?</strong>
                  <span>Authenticate once so Pitch can record the signed-in experience.</span>
                </div>
                <div class="url-auth-suggestion__actions">
                  <button class="url-auth-suggestion__public" onClick={() => setDismissed(url())}>
                    <Globe2 size={13} /> Public site
                  </button>
                  <button
                    class="url-auth-suggestion__authenticate"
                    onClick={() => {
                      if (!s.id) return
                      sessionStorage.setItem(`pitch:project-auth-draft:${s.id}`, s.draft)
                      navigate(
                        `/sessions?url=${encodeURIComponent(url())}&from=project&project=${encodeURIComponent(s.id)}`,
                      )
                    }}
                  >
                    Authenticate
                  </button>
                </div>
                <button class="url-auth-suggestion__close" onClick={() => setDismissed(url())}>
                  <X size={13} />
                </button>
              </section>
            </div>
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
              void send()
            }
          }}
        />
        <div class="job-composer-footer">
          <div class="job-composer-tools">
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
          </div>
          <div class="job-composer-actions">
            <CreditMarker getToken={s.getToken} />
            <Show when={models().length}>
              <div class="model-select" ref={modelEl}>
                <button
                  class="model-btn"
                  onClick={() => setModelOpen(v => !v)}
                  aria-label="Choose model"
                  aria-haspopup="listbox"
                  aria-expanded={modelOpen()}
                >
                  <span>
                    {models().find(m => m.spec === (s.model ?? defaultModel()))?.label ?? 'Model'}
                  </span>
                  <ChevronDown size={12} />
                </button>
                <Show when={modelOpen()}>
                  <div class="model-menu" role="listbox">
                    <For each={models()}>
                      {m => (
                        <button
                          class={`model-option${m.spec === (s.model ?? defaultModel()) ? ' is-active' : ''}`}
                          onClick={() => {
                            s.setModel(m.spec)
                            setModelOpen(false)
                          }}
                        >
                          {m.label}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
            <Show
              when={s.busy}
              fallback={
                <button
                  class="job-send-round"
                  disabled={uploading() || !s.draft.trim()}
                  onClick={() => void send()}
                  aria-label="Send message"
                >
                  <ArrowUp size={17} />
                </button>
              }
            >
              <button
                class="job-send-round stop"
                onClick={() => void s.stop()}
                aria-label="Stop generation"
              >
                <Square size={12} fill="currentColor" />
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
