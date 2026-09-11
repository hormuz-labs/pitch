import { useNavigate, useSearchParams } from '@solidjs/router'
import Lenis from 'lenis'
import {
  ArrowUp,
  Clock3,
  Film,
  Paperclip,
  Plus,
  RectangleHorizontal,
  Sparkles,
  X,
} from 'lucide-solid'
import 'lenis/dist/lenis.css'
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js'
import { FeaturedVideos } from '../../components/landing/FeaturedVideos'
import { DECK_TEMPLATES } from '../../lib/deckTemplates'
import {
  createProject,
  listStudioModels,
  type StudioModel,
  type UploadRef,
  uploads as uploadFiles,
} from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { PitchWordmark } from '../public/brand'
import { CreditPopover } from './credits'
import { Popover, Select } from './primitives'
import type { SettingsSection } from './SettingsView'
import { TopNav } from './TopNav.tsx'
import '../../studio/studio.css'
import '../../styles/new-project.css'

const ACCEPT =
  '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a'
const RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const
const SKILLS = [
  { id: 'launch-video', label: 'Launch video', prompt: 'Create a cinematic launch video for ' },
  { id: 'demo-video', label: 'Product demo', prompt: 'Create a narrated product demo for ' },
  { id: 'slide-deck', label: 'Slide deck', prompt: 'Create a concise presentation about ' },
  {
    id: 'recording-edit',
    label: 'Edit recording',
    prompt: 'Polish this recording with clean cuts and captions.',
  },
] as const
type Skill = (typeof SKILLS)[number]['id']
const FLOW_TO_SKILL: Record<string, Skill> = {
  deck: 'slide-deck',
  'launch-video': 'launch-video',
  'demo-video': 'demo-video',
  'recording-edit': 'recording-edit',
}

/** The empty composer keeps suggesting openings, typed out and erased in
 * place so the box is never a blank stare. It pauses the moment real text is
 * in the field; with reduced motion the first one just sits there, static. */
const PLACEHOLDER_PROMPTS = [
  'A launch video for https://yourproduct.com.',
  'A cinematic brand documentary about our origin, customers and point of view.',
  'A clear deep-dive explainer that makes this complex topic feel obvious.',
  'Match the pacing and visual language of this YouTube video: https://youtube.com/.',
  'Create a refined loading animation using this logo.',
  'Turn this recording into a polished talking-head video with captions and clean cuts.',
]

function useTypedPlaceholder(paused: Accessor<boolean>) {
  const [text, setText] = createSignal('')
  createEffect(() => {
    if (paused()) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(PLACEHOLDER_PROMPTS[0])
      return
    }
    let phrase = 0
    let char = 0
    let deleting = false
    let timer = 0
    const step = () => {
      const current = PLACEHOLDER_PROMPTS[phrase]
      char += deleting ? -1 : 1
      setText(current.slice(0, char))
      let delay = deleting ? 14 : 32
      if (!deleting && char === current.length) {
        deleting = true
        delay = 2800
      } else if (deleting && char === 0) {
        deleting = false
        phrase = (phrase + 1) % PLACEHOLDER_PROMPTS.length
        delay = 500
      }
      timer = window.setTimeout(step, delay)
    }
    timer = window.setTimeout(step, 800)
    onCleanup(() => window.clearTimeout(timer))
  })
  return text
}

export function NewProjectView(props: {
  onNotice?: (message: string, type: 'success' | 'error') => void
  openSettings?: (section: SettingsSection) => void
}) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [prompt, setPrompt] = createSignal(
    typeof params.prompt === 'string' ? params.prompt : (params.prompt?.[0] ?? ''),
  )
  const [files, setFiles] = createSignal<UploadRef[]>([])
  const [referenceVideoFiles, setReferenceVideoFiles] = createSignal<string[]>([])
  const [uploading, setUploading] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)
  const [dragging, setDragging] = createSignal(false)
  const [error, setError] = createSignal('')
  const [ratio, setRatio] = createSignal<(typeof RATIOS)[number]>('16:9')
  const [duration, setDuration] = createSignal<number | null>(null)
  const [deckTemplate, setDeckTemplate] = createSignal<(typeof DECK_TEMPLATES)[number] | null>(null)
  const queryValue = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : value?.[0]
  const initialFlow = queryValue(params.flow)
  const [skill, setSkill] = createSignal<Skill | null>(
    initialFlow ? (FLOW_TO_SKILL[initialFlow] ?? null) : null,
  )
  const [models, setModels] = createSignal<StudioModel[]>([])
  const [model, setModel] = createSignal('')
  let input!: HTMLInputElement
  let referenceInput!: HTMLInputElement
  let textarea!: HTMLTextAreaElement
  const activeSkill = createMemo(() => SKILLS.find(item => item.id === skill()))
  const selectDeckTemplate = (template: (typeof DECK_TEMPLATES)[number]) => {
    setDeckTemplate(template)
    setPrompt(
      `Create a 12-slide presentation using the ${template.name} template. For example: Slide 3 should compare pricing; slide 8 should show the roadmap. Topic: `,
    )
    setError('')
    requestAnimationFrame(() => textarea.focus())
  }
  const typedPlaceholder = useTypedPlaceholder(() => prompt().length > 0)
  createEffect(() => {
    const flow = queryValue(params.flow)
    setSkill(flow ? (FLOW_TO_SKILL[flow] ?? null) : null)
  })
  createEffect(() => {
    const value = queryValue(params.prompt)
    if (value !== undefined) setPrompt(value)
  })
  onMount(async () => {
    textarea.focus()
    try {
      const token = await getToken()
      if (!token) return
      const result = await listStudioModels(token)
      setModels(result.models)
      setModel(result.default)
    } catch {
      /* server default remains available */
    }
  })
  let pageRoot: HTMLDivElement | undefined
  // Lenis on the page's own scroll container (main.app-shell-main, not the
  // window): the long featured-videos pass should glide. Overscroll stays off
  // so the page comes to rest exactly on the end of that section.
  onMount(() => {
    const wrapper = pageRoot?.closest('.app-shell-main')
    if (!pageRoot || !(wrapper instanceof HTMLElement)) return
    const lenis = new Lenis({
      wrapper,
      content: pageRoot,
      lerp: 0.09,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      anchors: true,
      overscroll: false,
      syncTouch: false,
      respectReducedMotion: true,
    })
    let frame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)
    onCleanup(() => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    })
  })
  const create = async (text: string, uploaded: UploadRef[], token: string) => {
    const project = await createProject(token, {
      prompt: text,
      uploads: uploaded,
      options: {
        aspectRatio: ratio(),
        ...(duration() ? { durationSeconds: duration() } : {}),
        ...(skill() ? { skill: skill() } : {}),
        ...(deckTemplate()
          ? {
              template: deckTemplate()!.id,
            }
          : {}),
        ...(referenceVideoFiles().length ? { referenceVideoFiles: referenceVideoFiles() } : {}),
      },
      ...(model() ? { model: model() } : {}),
    })
    window.dispatchEvent(new Event('credits-changed'))
    navigate(`/p/${project.id}`)
  }
  const pick = async (list: FileList | null, openAfter = false, reference = false) => {
    if (!list?.length) return
    const picked = [...list]
    const oversized = picked.find(file => file.size > 500 * 1024 * 1024)
    if (oversized) {
      props.onNotice?.(`${oversized.name} is over 500 MB`, 'error')
      return
    }
    setUploading(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const form = new FormData()
      picked.forEach(file => form.append('files', file))
      const added = await uploadFiles(token, form)
      setFiles(current => [...current, ...added])
      if (reference)
        setReferenceVideoFiles(current => [
          ...new Set([...current, ...added.map(file => file.name)]),
        ])
      if (openAfter) await create(prompt().trim(), added, token)
    } catch (reason) {
      props.onNotice?.(reason instanceof Error ? reason.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      input.value = ''
      referenceInput.value = ''
    }
  }
  const submit = async () => {
    if (submitting() || uploading()) return
    if (!prompt().trim() && !files().length) {
      setError('Describe what you want, or attach a file to work on.')
      return
    }
    setSubmitting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      await create(prompt().trim(), files(), token)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not create the project'
      setError(message)
      props.onNotice?.(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div
      ref={pageRoot}
      class={`lv-studio new-project-page ${dragging() ? 'dropping' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        void pick(event.dataTransfer?.files ?? null, true)
      }}
    >
      <TopNav openSettings={props.openSettings} />
      <Show when={dragging()}>
        <div class="drop-veil" aria-live="polite">
          <span>Drop it here - this opens the editor</span>
        </div>
      </Show>
      <section class="new-create-hero">
        <div class="new-create-hero__intro">
          <PitchWordmark class="new-project-wordmark" />
        </div>
        <div class="composer-wrap new-composer-wrap">
          <div class={`composer-box ${error() ? 'invalid' : ''}`}>
            <Show when={files().length}>
              <div class="attach-row">
                <For each={files()}>
                  {(file, index) => (
                    <span class="attach-chip">
                      <span>{file.name}</span>
                      <button
                        aria-label={`Remove ${file.name}`}
                        onClick={() => {
                          const remaining = files().filter((_, i) => i !== index())
                          setFiles(remaining)
                          if (!remaining.some(item => item.name === file.name))
                            setReferenceVideoFiles(items =>
                              items.filter(name => name !== file.name),
                            )
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <textarea
              ref={textarea}
              rows={2}
              id="new-project-prompt"
              placeholder={activeSkill()?.prompt ?? typedPlaceholder()}
              value={prompt()}
              onInput={event => {
                setPrompt(event.currentTarget.value)
                setError('')
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
            />
            <div class="composer-footer">
              <div class="tool-row composer-add">
                <input
                  ref={input}
                  type="file"
                  hidden
                  multiple
                  accept={ACCEPT}
                  onChange={event => void pick(event.currentTarget.files)}
                />
                <input
                  ref={referenceInput}
                  type="file"
                  hidden
                  accept=".mp4,.webm,.mov,.mkv"
                  onChange={event => void pick(event.currentTarget.files, false, true)}
                />
                <Popover
                  label="Add files and preferences"
                  trigger={
                    <span class="attach-plus">
                      <Plus size={18} />
                    </span>
                  }
                  class="composer-add-menu absolute bottom-full left-0 z-20 mb-2"
                >
                  <button role="menuitem" onClick={() => input.click()}>
                    <Paperclip size={15} />
                    <span>Add photos &amp; files</span>
                  </button>
                  <button role="menuitem" onClick={() => referenceInput.click()}>
                    <Film size={15} />
                    <span>Add a reference video</span>
                  </button>
                  <label>
                    <RectangleHorizontal size={15} />
                    <span>Aspect ratio</span>
                    <select
                      value={ratio()}
                      onChange={event =>
                        setRatio(event.currentTarget.value as (typeof RATIOS)[number])
                      }
                    >
                      <For each={RATIOS}>{value => <option>{value}</option>}</For>
                    </select>
                  </label>
                  <label>
                    <Clock3 size={15} />
                    <span>Duration</span>
                    <select
                      value={duration() ?? ''}
                      onChange={event =>
                        setDuration(
                          event.currentTarget.value ? Number(event.currentTarget.value) : null,
                        )
                      }
                    >
                      <option value="">Auto</option>
                      <For each={[6, 15, 30, 60]}>
                        {value => <option value={value}>{value} seconds</option>}
                      </For>
                    </select>
                  </label>
                </Popover>
                <Show when={activeSkill()}>
                  {selected => (
                    <span class="new-skill-chip">
                      <Sparkles size={13} />
                      {selected().label}
                    </span>
                  )}
                </Show>
              </div>
              <div class="tool-row">
                <span class="composer-credits">
                  <CreditPopover variant="marker" />
                </span>
                <Show when={models().length}>
                  <Select
                    value={model()}
                    label="Model"
                    options={models().map(item => ({ value: item.spec, label: item.label }))}
                    onChange={setModel}
                    class="model-btn"
                  />
                </Show>
                <button
                  class="send-btn"
                  disabled={submitting() || uploading() || (!prompt().trim() && !files().length)}
                  onClick={() => void submit()}
                  aria-label="Start project"
                >
                  <Show when={!submitting()} fallback={<span class="spinner" />}>
                    <ArrowUp size={17} />
                  </Show>
                </button>
              </div>
            </div>
          </div>
          <Show when={error()}>
            <div class="create-error" role="alert">
              {error()}
            </div>
          </Show>
          <div class="new-skills">
            <For each={SKILLS}>
              {item => (
                <button
                  class={`new-skill-pill ${skill() === item.id ? 'is-active' : ''}`}
                  aria-pressed={skill() === item.id}
                  onClick={() => {
                    setSkill(current => {
                      if (current === item.id) {
                        if (item.id === 'slide-deck') setDeckTemplate(null)
                        return null
                      }
                      return item.id
                    })
                  }}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
          <Show when={skill() === 'slide-deck'}>
            <section class="new-template-strip new-skill-gallery">
              <div class="new-template-strip__head">
                <span>Choose a slide deck template</span>
                <button onClick={() => navigate('/projects?kind=deck')}>Your decks</button>
              </div>
              <div class="new-template-strip__cards">
                <For each={DECK_TEMPLATES}>
                  {template => (
                    <button
                      class={deckTemplate()?.id === template.id ? 'is-active' : ''}
                      onClick={() => selectDeckTemplate(template)}
                    >
                      <span>{template.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>
          <a class="new-featured-cue" href="#featured-videos">
            See featured videos <span>↓</span>
          </a>
        </div>
      </section>
      <FeaturedVideos />
    </div>
  )
}
