import { useNavigate, useSearchParams } from '@solidjs/router'
import Lenis from 'lenis'
import {
  ArrowUp,
  AudioLines,
  Check,
  ChevronDown,
  ChevronsUp,
  Clock3,
  Film,
  Lightbulb,
  MonitorPlay,
  Paperclip,
  Plus,
  Presentation,
  RectangleHorizontal,
  Rocket,
  Scissors,
  Sparkles,
  X,
} from 'lucide-solid'
import 'lenis/dist/lenis.css'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { FeaturedVideos } from '../../components/landing/FeaturedVideos'
import { isApiError } from '../../lib/api'
import { DECK_TEMPLATES } from '../../lib/deckTemplates'
import {
  createProject,
  listStudioModels,
  type StudioModel,
  type UploadRef,
  uploads as uploadFiles,
  type VoicePreference,
} from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { PitchWordmark } from '../public/brand'
import { DiscordOfferModal } from './DiscordOfferModal'
import type { SettingsSection } from './SettingsView'
import { StudioMenu, StudioSubmenu } from './StudioMenu'
import { VoicePicker } from './VoicePicker'
import '../../studio/studio.css'
import '../../styles/new-project.css'

const ACCEPT =
  '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a'
const RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const
const SKILLS = [
  {
    id: 'launch-video',
    label: 'Launch video',
    icon: Rocket,
    prompt: 'Create a cinematic launch video for ',
  },
  {
    id: 'demo-video',
    label: 'Product demo',
    icon: MonitorPlay,
    prompt: 'Create a narrated product demo for ',
  },
  {
    id: 'slide-deck',
    label: 'Slide deck',
    icon: Presentation,
    prompt: 'Create a concise presentation about ',
  },
  {
    id: 'recording-edit',
    label: 'Edit recording',
    icon: Scissors,
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
  const [creditOfferOpen, setCreditOfferOpen] = createSignal(false)
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
  const [voice, setVoice] = createSignal<VoicePreference | null>(null)
  const [voiceOpen, setVoiceOpen] = createSignal(false)
  const [exploring, setExploring] = createSignal(false)
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
  createEffect(() => {
    prompt()
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  })
  createEffect(() => {
    const flow = queryValue(params.flow)
    setSkill(flow ? (FLOW_TO_SKILL[flow] ?? null) : null)
  })
  createEffect(() => {
    const value = queryValue(params.prompt)
    if (value !== undefined) setPrompt(value)
  })
  onMount(async () => {
    if (window.matchMedia('(min-width: 761px)').matches) textarea.focus()
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
  let scrollController: Lenis | undefined
  const scrollTo = (target: 'inspiration' | 'composer') => {
    const element = pageRoot?.querySelector<HTMLElement>('.new-featured-cue')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollController?.scrollTo(target === 'composer' ? 0 : (element ?? 0), {
      duration: 0.55,
      easing: t => 1 - (1 - t) ** 4,
      immediate: reduced,
      onComplete: () => {
        if (target === 'composer') textarea.focus({ preventScroll: true })
      },
    })
  }
  // Smooth the page's own scroll container, including the inspiration anchor.
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
    scrollController = lenis
    const updateExplore = () => {
      const hero = pageRoot?.querySelector<HTMLElement>('.new-create-hero')
      const travel = Math.max(1, (hero?.offsetHeight ?? wrapper.clientHeight) - 52)
      const progress = Math.min(1, wrapper.scrollTop / travel)
      pageRoot?.style.setProperty('--explore-progress', String(progress))
      setExploring(progress > 0.4)
    }
    const reset = () => {
      setPrompt('')
      setFiles([])
      setReferenceVideoFiles([])
      setSkill(null)
      setDeckTemplate(null)
      setError('')
      setVoice(null)
      setRatio('16:9')
      setDuration(null)
      scrollTo('composer')
    }
    wrapper.addEventListener('scroll', updateExplore, { passive: true })
    window.addEventListener('pitch:new-chat', reset)
    let frame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)
    onCleanup(() => {
      cancelAnimationFrame(frame)
      wrapper.removeEventListener('scroll', updateExplore)
      window.removeEventListener('pitch:new-chat', reset)
      lenis.destroy()
      scrollController = undefined
    })
  })
  const create = async (text: string, uploaded: UploadRef[], token: string) => {
    const project = await createProject(token, {
      prompt: text,
      uploads: uploaded,
      options: {
        aspectRatio: ratio(),
        ...(voice() ? { narrationVoice: voice() } : {}),
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
    if (!list?.length || uploading() || submitting()) return
    const picked = [...list]
    const oversized = picked.find(file => file.size > 500 * 1024 * 1024)
    if (oversized) {
      setError(`${oversized.name} is over 500 MB`)
      return
    }
    setUploading(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const form = new FormData()
      picked.forEach(file => form.append('files', file))
      const added = await uploadFiles(token, form)
      const allFiles = [...files(), ...added]
      setFiles(allFiles)
      if (reference)
        setReferenceVideoFiles(current => [
          ...new Set([...current, ...added.map(file => file.name)]),
        ])
      if (openAfter && !prompt().trim()) await create('', allFiles, token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed')
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
      if (isApiError(reason) && reason.status === 402) {
        setError('')
        setCreditOfferOpen(true)
        return
      }
      const message = reason instanceof Error ? reason.message : 'Could not create the project'
      setError(message)
      props.onNotice?.(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }
  let dragDepth = 0
  return (
    <div
      ref={pageRoot}
      class={`lv-studio new-project-page ${dragging() ? 'dropping' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDragEnter={event => {
        if (!event.dataTransfer?.types.includes('Files')) return
        dragDepth++
        setDragging(true)
      }}
      onDragLeave={() => {
        dragDepth = Math.max(0, dragDepth - 1)
        if (!dragDepth) setDragging(false)
      }}
      onDrop={event => {
        event.preventDefault()
        dragDepth = 0
        setDragging(false)
        void pick(event.dataTransfer?.files ?? null, true)
      }}
    >
      <Show when={creditOfferOpen()}>
        <DiscordOfferModal
          mode="no-credits"
          onClose={() => setCreditOfferOpen(false)}
          onBuyCredits={() => {
            setCreditOfferOpen(false)
            props.openSettings?.('credits')
          }}
          onJoinDiscord={() => {
            setCreditOfferOpen(false)
            window.open('https://discord.gg/a4SBW36mD', '_blank', 'noopener,noreferrer')
          }}
        />
      </Show>
      <Show when={voiceOpen()}>
        <VoicePicker value={voice()} onChange={setVoice} onClose={() => setVoiceOpen(false)} />
      </Show>
      <Show when={dragging()}>
        <div class="drop-veil" aria-live="polite">
          <span>
            {prompt().trim()
              ? 'Drop files to add them to your brief'
              : 'Drop a file to open it in the studio'}
          </span>
        </div>
      </Show>
      <section class="new-create-hero">
        <div class="new-create-hero__intro">
          <PitchWordmark class="new-project-wordmark" />
          <h1 class="sr-only">What do you want to make?</h1>
        </div>
        <div class="composer-wrap new-composer-wrap">
          <div class={`composer-box ${error() ? 'invalid' : ''}`}>
            <Show when={files().length}>
              <div class="attach-row">
                <For each={files()}>
                  {(file, index) => (
                    <span class="attach-chip">
                      <span>{file.name}</span>
                      <Show when={referenceVideoFiles().includes(file.name)}>
                        <em>Reference</em>
                      </Show>
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
              aria-label="Describe your project"
              aria-describedby={error() ? 'new-project-error' : 'new-project-hint'}
              aria-invalid={Boolean(error())}
              disabled={submitting()}
              placeholder={
                activeSkill()?.prompt ??
                'Describe a video, presentation, or edit. Start with an idea or a link…'
              }
              value={prompt()}
              onInput={event => {
                setPrompt(event.currentTarget.value)
                setError('')
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
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
                <StudioMenu
                  label="Add files and preferences"
                  width={208}
                  triggerClass="composer-menu-trigger"
                  trigger={
                    <span class="attach-plus">
                      <Show when={!uploading()} fallback={<span class="spinner" />}>
                        <Plus size={20} />
                      </Show>
                    </span>
                  }
                >
                  <button
                    role="menuitem"
                    disabled={uploading() || submitting()}
                    onClick={() => input.click()}
                  >
                    <Paperclip size={15} />
                    <span>Add files &amp; photos</span>
                  </button>
                  <button
                    role="menuitem"
                    disabled={uploading() || submitting()}
                    onClick={() => referenceInput.click()}
                  >
                    <Film size={15} />
                    <span>Reference video</span>
                  </button>
                  <button role="menuitem" onClick={() => setVoiceOpen(true)}>
                    <AudioLines size={16} />
                    <span>Narration voice</span>
                  </button>
                  <div class="menu-separator" />
                  <StudioSubmenu
                    label="Aspect ratio"
                    icon={<RectangleHorizontal />}
                    value={ratio()}
                  >
                    <For each={RATIOS}>
                      {value => (
                        <button
                          role="menuitemradio"
                          aria-checked={ratio() === value}
                          onClick={() => setRatio(value)}
                        >
                          <span>{value}</span>
                          <Show when={ratio() === value}>
                            <Check class="menu-check" />
                          </Show>
                        </button>
                      )}
                    </For>
                  </StudioSubmenu>
                  <StudioSubmenu
                    label="Duration"
                    icon={<Clock3 />}
                    value={duration() ? `${duration()}s` : 'Auto'}
                  >
                    <For each={[null, 6, 15, 30, 60]}>
                      {value => (
                        <button
                          role="menuitemradio"
                          aria-checked={duration() === value}
                          onClick={() => setDuration(value)}
                        >
                          <span>{value ? `${value} seconds` : 'Auto'}</span>
                          <Show when={duration() === value}>
                            <Check class="menu-check" />
                          </Show>
                        </button>
                      )}
                    </For>
                  </StudioSubmenu>
                </StudioMenu>
                <Show when={voice()}>
                  <button
                    class={`new-voice-trigger ${voice() ? 'is-selected' : ''}`}
                    aria-label={
                      voice()
                        ? `Change narration voice, ${voice()!.name}`
                        : 'Choose narration voice'
                    }
                    aria-haspopup="dialog"
                    disabled={submitting()}
                    onClick={() => setVoiceOpen(true)}
                  >
                    <AudioLines size={16} />
                    <span>{voice()?.name.split(' - ')[0] ?? 'Voice'}</span>
                    <ChevronDown size={12} />
                  </button>
                </Show>
              </div>
              <div class="tool-row">
                <Show when={models().length}>
                  <StudioMenu
                    label="Model"
                    align="end"
                    width={264}
                    triggerClass="new-model-trigger"
                    trigger={
                      <>
                        <span>
                          {models().find(item => item.spec === model())?.label ?? 'Model'}
                        </span>
                        <ChevronDown size={14} />
                      </>
                    }
                  >
                    <For each={models()}>
                      {item => (
                        <button
                          class="menu-model"
                          role="menuitemradio"
                          aria-checked={model() === item.spec}
                          onClick={() => setModel(item.spec)}
                        >
                          <span>
                            <strong>{item.label}</strong>
                            <small class="menu-description">
                              {item.label.includes('Pro')
                                ? 'Detailed planning and complex projects'
                                : item.label.includes('Gemma')
                                  ? 'Open-weight model for creative work'
                                  : 'Quick drafts and everyday projects'}
                            </small>
                          </span>
                          <Show when={model() === item.spec}>
                            <Check class="menu-check" />
                          </Show>
                        </button>
                      )}
                    </For>
                  </StudioMenu>
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
            <Show when={activeSkill() || ratio() !== '16:9' || duration()}>
              <div class="new-preferences">
                <Show when={activeSkill()}>
                  {selected => (
                    <button
                      class="new-skill-chip"
                      aria-label={`Clear ${selected().label} preference`}
                      onClick={() => {
                        setSkill(null)
                        setDeckTemplate(null)
                      }}
                    >
                      <Sparkles size={12} />
                      {selected().label}
                      <X size={12} />
                    </button>
                  )}
                </Show>
                <Show when={ratio() !== '16:9'}>
                  <button aria-label="Reset aspect ratio" onClick={() => setRatio('16:9')}>
                    {ratio()}
                    <X size={12} />
                  </button>
                </Show>
                <Show when={duration()}>
                  <button aria-label="Reset duration" onClick={() => setDuration(null)}>
                    {duration()}s<X size={12} />
                  </button>
                </Show>
              </div>
            </Show>
          </div>
          <Show when={error()}>
            <div id="new-project-error" class="create-error" role="alert">
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
                      if (item.id !== 'slide-deck') setDeckTemplate(null)
                      return item.id
                    })
                    textarea.focus()
                  }}
                >
                  <item.icon size={16} />
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
          <p class="sr-only" id="new-project-hint">
            {uploading()
              ? 'Uploading your files…'
              : files().length && !prompt().trim()
                ? 'Open your files in the studio, then tell Pitch what to change.'
                : 'Drop a file to start from what you have. Pitch takes it from there.'}
          </p>
        </div>
        <button
          class="new-featured-cue"
          onClick={() => scrollTo('inspiration')}
          aria-label="Explore inspiration"
        >
          <span>
            <Lightbulb size={16} />
            Explore inspiration
          </span>
          <span>
            Scroll to explore <ChevronsUp size={15} />
          </span>
        </button>
      </section>
      <FeaturedVideos />
      <div class={`new-return-wrap ${exploring() ? 'is-visible' : ''}`} inert={!exploring()}>
        <button class="new-return-button" onClick={() => scrollTo('composer')}>
          <ArrowUp size={17} />
          Create with Pitch
        </button>
      </div>
    </div>
  )
}
