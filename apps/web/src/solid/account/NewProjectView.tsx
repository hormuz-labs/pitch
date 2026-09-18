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
  Paperclip,
  Plus,
  RectangleHorizontal,
} from 'lucide-solid'
import 'lenis/dist/lenis.css'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { FeaturedVideos } from '../../components/landing/FeaturedVideos'
import { GenerateButton } from '../../components/ui/generate-button'
import { API_URL } from '../../config'
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
import { ComposerShell } from '../common/ComposerShell'
import { useAuth, useUser } from '../core/auth'
import { openStudioProject } from '../core/projectNavigation'
import { loadRouteModule } from '../core/routes'
import { PitchWordmark } from '../public/brand'
import { DISCORD_INVITE_URL } from '../public/socials'
import { useBrowserProfile } from '../studio/useBrowserProfile'
import { DiscordOfferModal } from './DiscordOfferModal'
import { ModelCatalog } from './ModelCatalog'
import { NewProjectAttachment } from './NewProjectAttachment'
import { NewProjectPreferences } from './NewProjectPreferences'
import { SelectedSkillMode, SKILLS, type Skill, SkillPicker } from './NewProjectSkillPicker'
import { NewProjectUrlAuth } from './NewProjectUrlAuth'
import type { SettingsSection } from './SettingsView'
import { StudioMenu, StudioSubmenu } from './StudioMenu'
import { startDiscordLink } from './settings/discord-connection'
import { VoicePicker } from './VoicePicker'
import '../../studio/studio.css'
import '../../styles/new-project.css'

const ACCEPT =
  '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a'
const RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const
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
  const { userAccessor: user } = useUser()
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
  const [credits, setCredits] = createSignal<number | null>(null)
  const [creditOfferOpen, setCreditOfferOpen] = createSignal(false)
  // The one-time Discord welcome reward while it is still on the table: an
  // empty balance then offers it beside the plans link instead of a dead end.
  // `linked` means the account is connected and only the server join is left.
  const [discordWelcome, setDiscordWelcome] = createSignal<{
    credits: number
    linked: boolean
  } | null>(null)
  const [linkingDiscord, setLinkingDiscord] = createSignal(false)
  const [voice, setVoice] = createSignal<VoicePreference | null>(null)
  const [voiceOpen, setVoiceOpen] = createSignal(false)
  const [exploring, setExploring] = createSignal(false)
  const browserProfile = useBrowserProfile()
  let input!: HTMLInputElement
  let referenceInput!: HTMLInputElement
  let textarea!: HTMLTextAreaElement
  const activeSkill = createMemo(() => SKILLS.find(item => item.id === skill()))
  const selectedModel = createMemo(() => models().find(item => item.spec === model()))
  const selectedModelCost = createMemo(() => {
    const selected = selectedModel()
    if (!selected) return 0
    if (!selected.videoCreditsPer30Seconds) return selected.estimatedCredits
    return Math.ceil(selected.videoCreditsPer30Seconds * (Math.max(30, duration() ?? 30) / 30))
  })
  const insufficientCredits = createMemo(() => {
    const balance = credits()
    const cost = selectedModelCost()
    return balance !== null && cost > balance ? cost - balance : 0
  })
  const outOfCredits = createMemo(() => credits() === 0)
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
  // Reward before balance: the reward read settles the welcome credits when a
  // linked member has not been paid yet, and the balance must include them.
  const loadCredits = async () => {
    const token = await getToken()
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    await fetch(`${API_URL}/credits/discord`, { headers, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return
        const reward = await response.json()
        const unclaimed = reward.state === 'unlinked' || reward.state === 'available'
        setDiscordWelcome(
          reward.configured && unclaimed
            ? { credits: reward.credits, linked: reward.state === 'available' }
            : null,
        )
      })
      .catch(() => {})
    await fetch(`${API_URL}/credits`, { headers, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return
        const data = await response.json()
        if (typeof data.balance === 'number') setCredits(data.balance)
      })
      .catch(() => {})
  }
  // Straight into Discord OAuth from the banner; Clerk brings the user back
  // to this page with the connection card open, where the reward settles.
  const linkDiscord = async () => {
    const current = user()
    if (!current || linkingDiscord()) return
    setLinkingDiscord(true)
    try {
      if ((await startDiscordLink(current)) === 'linked') await loadCredits()
    } catch {
      props.openSettings?.('connections')
    } finally {
      setLinkingDiscord(false)
    }
  }
  onMount(async () => {
    const savedDraft = sessionStorage.getItem('pitch:new-project-auth-draft')
    if (savedDraft) {
      setPrompt(savedDraft)
      sessionStorage.removeItem('pitch:new-project-auth-draft')
    }
    if (window.matchMedia('(min-width: 761px)').matches) textarea.focus()
    // Coming back from the Discord app after joining is what pays the reward.
    const refresh = () => void loadCredits()
    window.addEventListener('credits-changed', refresh)
    window.addEventListener('focus', refresh)
    onCleanup(() => {
      window.removeEventListener('credits-changed', refresh)
      window.removeEventListener('focus', refresh)
    })
    const token = await getToken()
    if (!token) return
    await Promise.allSettled([
      listStudioModels(token).then(result => {
        setModels(result.models)
        setModel(result.default)
      }),
      loadCredits(),
    ])
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
    const studioRouteReady = loadRouteModule('studio')
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
    await openStudioProject(project.id, navigate, studioRouteReady)
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
        void loadCredits()
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
          onClaimReward={() => {
            setCreditOfferOpen(false)
            props.openSettings?.('connections')
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
          <ComposerShell
            class="composer-box"
            footerClass="composer-footer"
            leadingClass="tool-row composer-add"
            trailingClass="tool-row"
            invalid={Boolean(error())}
            leading={
              <>
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
                <SelectedSkillMode
                  skill={skill()}
                  onClear={() => {
                    setSkill(null)
                    setDeckTemplate(null)
                    textarea.focus()
                  }}
                />
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
              </>
            }
            trailing={
              <>
                <Show when={models().length}>
                  <StudioMenu
                    label="Model"
                    align="end"
                    side="top"
                    width={420}
                    triggerClass="new-model-trigger"
                    trigger={
                      <>
                        <span>{selectedModel()?.label ?? 'Model'}</span>
                        <ChevronDown size={14} />
                      </>
                    }
                  >
                    <ModelCatalog models={models()} selected={model()} onSelect={setModel} />
                  </StudioMenu>
                </Show>
                <GenerateButton
                  isGenerating={submitting()}
                  isReady={Boolean(prompt().trim() || files().length)}
                  disabled={submitting() || uploading() || (!prompt().trim() && !files().length)}
                  onClick={() => void submit()}
                  aria-label={submitting() ? 'Generating project' : 'Generate project'}
                />
              </>
            }
          >
            <Show when={files().length}>
              <div class="attach-row">
                <For each={files()}>
                  {(file, index) => (
                    <NewProjectAttachment
                      file={file}
                      reference={referenceVideoFiles().includes(file.name)}
                      onRemove={() => {
                        const remaining = files().filter((_, i) => i !== index())
                        setFiles(remaining)
                        if (!remaining.some(item => item.name === file.name))
                          setReferenceVideoFiles(items => items.filter(name => name !== file.name))
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
            <NewProjectPreferences
              ratio={ratio()}
              duration={duration()}
              onResetRatio={() => setRatio('16:9')}
              onResetDuration={() => setDuration(null)}
            />
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
          </ComposerShell>
          <Show when={!browserProfile.loading()}>
            <NewProjectUrlAuth prompt={prompt()} authenticatedOrigins={browserProfile.origins()} />
          </Show>
          <Show
            when={outOfCredits() && discordWelcome()}
            fallback={
              <Show when={insufficientCredits() > 0}>
                <div class="composer-credit-notice" role="alert">
                  <span>{insufficientCredits().toLocaleString()} more credits needed</span>
                  <a href="/pricing">View plans</a>
                </div>
              </Show>
            }
          >
            {welcome => (
              <div class="composer-credit-notice" role="alert">
                <span>No credits left</span>
                <button type="button" onClick={() => props.openSettings?.('credits')}>
                  Buy credits
                </button>
                <Show
                  when={welcome().linked}
                  fallback={
                    <button type="button" disabled={linkingDiscord()} onClick={linkDiscord}>
                      {linkingDiscord()
                        ? 'Opening Discord…'
                        : `Claim ${welcome().credits.toLocaleString()} free`}
                    </button>
                  }
                >
                  <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                    Claim {welcome().credits.toLocaleString()} free
                  </a>
                </Show>
              </div>
            )}
          </Show>
          <Show when={error()}>
            <div id="new-project-error" class="create-error" role="alert">
              {error()}
            </div>
          </Show>
          <SkillPicker
            skill={skill()}
            onSelect={next => {
              if (next !== 'slide-deck') setDeckTemplate(null)
              setSkill(next)
            }}
            onFocusComposer={() => textarea.focus()}
          />
          <Show when={skill() === 'slide-deck'}>
            <section class="new-template-strip new-skill-gallery">
              <div class="new-template-strip__head">
                <span>Choose a slide deck template</span>
                <button onClick={() => navigate('/chats/history?kind=deck')}>Your decks</button>
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
