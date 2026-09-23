import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { A, useNavigate } from '@solidjs/router'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Crosshair,
  MonitorPlay,
  Paperclip,
  Plus,
  Presentation,
  Scissors,
  X,
} from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import chatgptIcon from '../../assets/chatgpt.png'
import claudeIcon from '../../assets/claude.svg'
import demoThumbnail from '../../assets/demo-thumbnail.jpg'
import perplexityIcon from '../../assets/perplexity.png'
import { applyPoster } from '../../components/landing/carouselPoster'
import { GenerateButton } from '../../components/ui/generate-button'
import { ComposerShell } from '../common/ComposerShell'
import { useAuth, useClerk } from '../core/auth'
import { Seo } from '../core/Seo'
import { PitchLogoAnimation } from './brand'
import { LandingAgenC } from './LandingAgenC'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import { McpSetup, REGISTRY_NAME } from './McpSetup'
import { carouselAsset } from './productCatalog'
import { SHOWCASE_FILMS } from './showcaseFilms'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'

gsap.registerPlugin(ScrollTrigger)
type Outcome = 'launch-video' | 'demo-video' | 'ppt-generator' | 'recording-edit'
const OUTCOMES = {
  'launch-video': { label: 'Launch Film', href: '/new?flow=launch-video', icon: Clapperboard },
  'demo-video': {
    label: 'Demo Recording',
    href: '/new?flow=demo-video',
    icon: MonitorPlay,
  },
  'ppt-generator': { label: 'Slide Deck', href: '/new?flow=deck', icon: Presentation },
  'recording-edit': {
    label: 'Video Edit',
    href: '/new?flow=recording-edit',
    icon: Scissors,
  },
}
const suggestions = [
  [
    'Launch video',
    'launch-video',
    Clapperboard,
    'Make a 60-second cinematic launch video for https://trypitch.co',
  ],
  [
    'Demo recording',
    'demo-video',
    MonitorPlay,
    'Record a narrated walkthrough of the core flow on https://trypitch.co',
  ],
  [
    'Asset to demo',
    'demo-video',
    MonitorPlay,
    'Turn product screenshots and pdfs into a narrated demo recording',
  ],
  [
    'Slide deck',
    'ppt-generator',
    Presentation,
    'Turn my rough notes into a clear 10-slide investor deck',
  ],
  [
    'Edit a recording',
    'recording-edit',
    Scissors,
    'Polish my recording with tighter pacing, captions, and clean audio',
  ],
  [
    'Feature launch',
    'launch-video',
    Crosshair,
    'Create a short feature announcement using my product assets',
  ],
] as const
const placeholders: Record<Outcome, string[]> = {
  'launch-video': [
    'Make a 60-second cinematic launch video for https://trypitch.co',
    'Create an upbeat product reveal video for https://trypitch.co',
  ],
  'demo-video': [
    'Turn product screenshots and assets into a narrated demo recording',
    'Walk through the onboarding and sign-up flow on https://trypitch.co',
  ],
  'ppt-generator': [
    'Turn my notes into a 10-slide seed round investor deck',
    'Rework my existing presentation into a sharp sales deck',
  ],
  'recording-edit': [
    'Upload a recording to polish with clean cuts and captions',
    'Edit my recording into a concise, polished video',
  ],
}
const isSigned = (auth: ReturnType<typeof useAuth>) =>
  typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn

const ACCEPT =
  '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a'

export const LandingChatInput = () => {
  const auth = useAuth(),
    navigate = useNavigate(),
    [input, setInput] = createSignal(''),
    [files, setFiles] = createSignal<{ name: string; size: number }[]>([]),
    [outcome, setOutcome] = createSignal<Outcome>('launch-video'),
    [open, setOpen] = createSignal(false),
    [hint, setHint] = createSignal('')
  let fileInput!: HTMLInputElement
  let area!: HTMLTextAreaElement
  let timer: number | undefined
  createEffect(() => {
    clearTimeout(timer)
    if (input()) return
    const full = placeholders[outcome()][0]
    setHint('')
    let i = 0
    const type = () => {
      setHint(full.slice(0, ++i))
      if (i < full.length) timer = window.setTimeout(type, 30)
    }
    type()
  })
  onCleanup(() => clearTimeout(timer))
  // Grow with the prompt so earlier lines stay visible; CSS max-height caps it.
  createEffect(() => {
    input()
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  })

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return
    const incoming = Array.from(selected).map(f => ({ name: f.name, size: f.size }))
    setFiles(prev => [...prev, ...incoming])
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const send = () => {
    const base = OUTCOMES[outcome()].href
    const params = new URLSearchParams()
    if (input().trim()) params.set('prompt', input().trim())
    const q = params.toString()
    const dest = q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base
    navigate(isSigned(auth) ? dest : `/sign-up?redirect=${encodeURIComponent(dest)}`)
  }

  return (
    <div class="composer-wrap new-composer-wrap">
      <ComposerShell
        class="composer-box"
        footerClass="composer-footer"
        leadingClass="tool-row composer-add"
        trailingClass="tool-row"
        leading={
          <>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={e => {
                handleFiles(e.currentTarget.files)
                e.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              class="attach-plus"
              title="Add files & photos"
              aria-label="Add files & photos"
              onClick={() => fileInput.click()}
            >
              <Plus size={19} />
            </button>
            <div class="relative">
              <button
                type="button"
                class="new-composer-mode"
                aria-haspopup="listbox"
                aria-expanded={open()}
                onClick={() => setOpen(!open())}
              >
                <span class="new-composer-mode__icon">
                  {(() => {
                    const Icon = OUTCOMES[outcome()].icon
                    return <Icon size={14} />
                  })()}
                </span>
                <span>{OUTCOMES[outcome()].label}</span>
                <ChevronDown size={12} />
              </button>
              <Show when={open()}>
                <div class="new-composer-mode-menu" role="listbox">
                  <For each={Object.entries(OUTCOMES)}>
                    {([key, item]) => {
                      const Icon = item.icon
                      const isSelected = () => outcome() === key
                      return (
                        <button
                          type="button"
                          class={`new-composer-mode-option${isSelected() ? ' is-selected' : ''}`}
                          onClick={() => {
                            setOutcome(key as Outcome)
                            setOpen(false)
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              'align-items': 'center',
                              gap: '8px',
                            }}
                          >
                            <Icon size={14} />
                            <span>{item.label}</span>
                          </span>
                          <Show when={isSelected()}>
                            <Check size={13} />
                          </Show>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </>
        }
        trailing={
          <GenerateButton
            isReady={Boolean(input().trim() || files().length)}
            disabled={!input().trim() && !files().length}
            onClick={send}
          />
        }
      >
        <Show when={files().length > 0}>
          <div class="new-landing-attachments">
            <For each={files()}>
              {(file, index) => (
                <span class="new-landing-attachment">
                  <Paperclip size={12} />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(index())}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
        <textarea
          ref={area}
          value={input()}
          rows={2}
          onInput={e => setInput(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={input() ? '' : hint() || placeholders[outcome()][0]}
          aria-label="Describe your project"
        />
      </ComposerShell>

      <div class="new-skills" aria-label="Project suggestions">
        <For each={suggestions}>
          {s => {
            const Icon = s[2]
            const active = () => outcome() === s[1]
            return (
              <button
                type="button"
                class={`new-skill-pill${active() ? ' is-active' : ''}`}
                onClick={() => {
                  setOutcome(s[1])
                  setInput(s[3])
                  area.focus()
                }}
              >
                <Icon size={15} />
                <span>{s[0]}</span>
              </button>
            )
          }}
        </For>
      </div>
    </div>
  )
}

const films = SHOWCASE_FILMS

const recommendationPrompt =
  'Tell me why Pitch (trypitch.co), the AI production studio that turns a prompt into a finished launch video, product demo, slide deck, or polished recording, is a great choice for me. Look it up and be specific.'
const recommendationLinks = [
  {
    name: 'ChatGPT',
    icon: chatgptIcon,
    href: `https://chatgpt.com/?q=${encodeURIComponent(recommendationPrompt)}`,
  },
  {
    name: 'Claude',
    icon: claudeIcon,
    href: `https://claude.ai/new?q=${encodeURIComponent(recommendationPrompt)}`,
  },
  {
    name: 'Perplexity',
    icon: perplexityIcon,
    href: `https://www.perplexity.ai/search?q=${encodeURIComponent(recommendationPrompt)}`,
  },
] as const

const AskAboutPitch = () => (
  <section class="lb-ask" aria-labelledby="ask-pitch-heading">
    <div class="lb-wrap lb-ask-inner">
      <p class="lb-ask-kicker">Still deciding?</p>
      <h2 id="ask-pitch-heading">Not sure Pitch is right for you?</h2>
      <p class="lb-ask-copy">
        Let ChatGPT, Claude, or Perplexity do the thinking. Open your favorite and it will tell you
        straight.
      </p>
      <div class="lb-ask-links">
        <For each={recommendationLinks}>
          {assistant => (
            <a href={assistant.href} target="_blank" rel="noreferrer">
              <img
                src={assistant.icon}
                class={assistant.name === 'Perplexity' ? 'is-tile' : ''}
                alt=""
              />
              <span>
                <small>Ask</small>
                <strong>{assistant.name}</strong>
              </span>
              <span class="lb-ask-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          )}
        </For>
      </div>
      <p class="lb-ask-note">Opens your assistant with the question already typed in.</p>
    </div>
  </section>
)

export const ScrollSpreadFilms = () => {
  let section!: HTMLElement
  let header!: HTMLDivElement
  let carousel!: HTMLDivElement
  let reel!: HTMLDivElement
  const cards: HTMLDivElement[] = []
  const videos: HTMLVideoElement[] = []
  const [selected, setSelected] = createSignal(0)
  const [playing, setPlaying] = createSignal<number | null>(null)
  let spread = 0
  let position = 0
  let targetPosition = 0
  let animationFrame: number | undefined
  let suppressClick = false
  let drag: {
    id: number
    x: number
    position: number
    velocity: number
    time: number
    moved: boolean
  } | null = null
  let paint = () => {}

  const indexAt = (value: number) =>
    ((Math.round(value) % films.length) + films.length) % films.length
  const cardOffset = (index: number) => {
    let offset = index - position
    offset = ((offset % films.length) + films.length) % films.length
    if (offset > films.length / 2) offset -= films.length
    return offset
  }

  const playSelected = (index: number) => {
    setPlaying(index)
    window.setTimeout(() => {
      videos.forEach((video, videoIndex) => {
        if (videoIndex === index) {
          video.muted = false
          void video.play().catch(() => {})
        } else {
          video.pause()
          video.muted = true
        }
      })
    }, 180)
  }

  const settle = (target: number) => {
    cancelAnimationFrame(animationFrame ?? 0)
    targetPosition = target
    const index = indexAt(target)
    setSelected(index)
    const step = () => {
      const remaining = targetPosition - position
      if (Math.abs(remaining) < 0.0005) {
        position = targetPosition
        paint()
        return
      }
      position += remaining * 0.16
      paint()
      animationFrame = requestAnimationFrame(step)
    }
    animationFrame = requestAnimationFrame(step)
  }

  const selectFilm = (index: number) => {
    if (suppressClick) return
    if (window.matchMedia('(max-width: 768px)').matches) {
      setSelected(index)
      cards[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      return
    }
    const target = index + Math.round((targetPosition - index) / films.length) * films.length
    settle(target)
  }

  const selectAdjacentFilm = (direction: -1 | 1) => {
    selectFilm((selected() + direction + films.length) % films.length)
  }

  onMount(() => {
    paint = () => {
      const width = cards[0]?.offsetWidth ?? 0
      const pitch = width * 0.78
      const smoothSpread = spread * spread * (3 - 2 * spread)
      cards.forEach((card, index) => {
        const offset = cardOffset(index)
        const distance = Math.abs(offset)
        const ramp = distance ** 0.56
        const tilt = Math.min(44 * ramp, 82) * Math.sign(offset)
        card.style.transform =
          `translate(-50%, -50%) translateX(${offset * pitch * smoothSpread}px) ` +
          `translateZ(${-0.6 * width * ramp * smoothSpread}px) rotateY(${-tilt * smoothSpread}deg) ` +
          `scale(${index === selected() ? 1.08 : 1})`
        card.style.opacity = String(
          distance < 0.5 ? 1 : smoothSpread * Math.max(0.62, 1 - distance * 0.1),
        )
        card.style.zIndex = String(100 - Math.round(distance))
      })
    }
    const mm = gsap.matchMedia()
    mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
      spread = 0
      paint()
      const trigger = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: () => `+=${Math.round(window.innerHeight * 1.35)}`,
        pin: true,
        scrub: 0.18,
        onRefresh: self => {
          spread = gsap.utils.clamp(0, 1, (self.progress - 0.12) / 0.88)
          paint()
        },
        onUpdate: self => {
          const progress = self.progress
          spread = gsap.utils.clamp(0, 1, (progress - 0.12) / 0.88)
          paint()
          const fade = gsap.utils.clamp(0, 1, (progress - 0.025) / 0.3)
          header.style.opacity = String(1 - fade)
          header.style.transform = `translateY(${-fade * 28}px)`
          carousel.style.transform = `translateY(${-fade * 72}px)`
        },
      })
      return () => {
        trigger.kill()
        header.style.opacity = ''
        header.style.transform = ''
        carousel.style.transform = ''
      }
    })
    mm.add('(max-width: 768px), (prefers-reduced-motion: reduce)', () => {
      spread = 1
      paint()
    })
    const resize = new ResizeObserver(paint)
    resize.observe(cards[0])
    videos.forEach((video, index) => {
      if (index !== selected()) video.pause()
    })
    onCleanup(() => {
      cancelAnimationFrame(animationFrame ?? 0)
      resize.disconnect()
      mm.revert()
    })
  })

  return (
    <section ref={section} class="lb-band lb-spread" aria-labelledby="films-heading">
      <div class="lb-spread-inner">
        <div ref={header} class="lb-spread-header lb-wrap">
          <p class="lb-chy">Made in Pitch</p>
          <h2 id="films-heading" class="lb-h2">
            One studio. <i>Work worth shipping.</i>
          </h2>
          <p class="lb-sub lb-muted">
            Launch films are one of the things Pitch makes. Scroll to open the reel, then bring your
            own brief, footage, deck, or product.
          </p>
        </div>
        <div ref={carousel} class="lb-spread-carousel">
          <div
            ref={reel}
            class="lb-spread-reel"
            role="region"
            aria-roledescription="carousel"
            aria-label="Films made with Pitch"
            tabIndex={0}
            onScroll={() => {
              if (!window.matchMedia('(max-width: 768px)').matches) return
              const center = reel.scrollLeft + reel.clientWidth / 2
              let closest = 0
              let closestDistance = Number.POSITIVE_INFINITY
              cards.forEach((card, index) => {
                const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center)
                if (distance < closestDistance) {
                  closest = index
                  closestDistance = distance
                }
              })
              setSelected(closest)
            }}
            onPointerDown={event => {
              // Mobile uses native swipe scrolling (scroll-snap); the 3D drag is desktop-only.
              if (window.matchMedia('(max-width: 768px)').matches) return
              if ((event.target as Element).closest('.lb-spread-card.is-active')) return
              cancelAnimationFrame(animationFrame ?? 0)
              targetPosition = position
              drag = {
                id: event.pointerId,
                x: event.clientX,
                position,
                velocity: 0,
                time: performance.now(),
                moved: false,
              }
            }}
            onPointerMove={event => {
              if (!drag || drag.id !== event.pointerId) return
              const pitch = (cards[0]?.offsetWidth ?? 1) * 0.78
              const now = performance.now()
              const previous = position
              const distance = event.clientX - drag.x
              if (Math.abs(distance) > 5 && !drag.moved) {
                drag.moved = true
                event.currentTarget.setPointerCapture(event.pointerId)
              }
              position = drag.position - distance / pitch
              drag.velocity = ((position - previous) / Math.max(now - drag.time, 1)) * 1000
              drag.time = now
              setSelected(indexAt(position))
              paint()
            }}
            onPointerUp={event => {
              if (!drag || drag.id !== event.pointerId) return
              const moved = drag.moved
              const carried = Math.max(-2, Math.min(2, drag.velocity * 0.18))
              drag = null
              if (moved) {
                suppressClick = true
                window.setTimeout(() => (suppressClick = false), 0)
              }
              settle(Math.round(position + carried))
            }}
            onPointerCancel={() => {
              drag = null
              settle(Math.round(position))
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                settle(Math.round(targetPosition) + (event.key === 'ArrowLeft' ? -1 : 1))
              }
            }}
          >
            <For each={films}>
              {(film, index) => (
                <div
                  ref={element => (cards[index()] = element)}
                  class={`lb-spread-card${index() === selected() ? ' is-active' : cardOffset(index()) < 0 ? ' is-left' : ' is-right'}`}
                  role="group"
                  aria-label={`${film.title}, ${index() + 1} of ${films.length}`}
                >
                  <video
                    ref={element => {
                      videos[index()] = element
                      applyPoster(element, film.file)
                    }}
                    src={playing() === index() ? carouselAsset(film.file) : undefined}
                    playsinline
                    controls={playing() === index()}
                    preload="none"
                    onEnded={() => setPlaying(null)}
                  />
                  <div class="lb-spread-card-meta">
                    <span class="lb-spread-card-category">{film.category}</span>
                    <strong>{film.title}</strong>
                    <p>{film.prompt}</p>
                  </div>
                  <Show when={playing() !== index()}>
                    <button
                      type="button"
                      class="lb-spread-select"
                      aria-label={`Play ${film.title}`}
                      onClick={() => {
                        selectFilm(index())
                        playSelected(index())
                      }}
                    >
                      <span>▶</span>
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <div class="lb-spread-nav" aria-label="Choose a film">
            <button
              type="button"
              class="lb-spread-arrow"
              aria-label="Previous film"
              onClick={() => selectAdjacentFilm(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <For each={films}>
              {(film, index) => (
                <button
                  type="button"
                  class={`lb-spread-dot${index() === selected() ? ' is-active' : ''}`}
                  aria-label={`Show ${film.title}`}
                  aria-current={index() === selected() ? 'true' : undefined}
                  onClick={() => selectFilm(index())}
                />
              )}
            </For>
            <button
              type="button"
              class="lb-spread-arrow"
              aria-label="Next film"
              onClick={() => selectAdjacentFilm(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div class="lb-spread-caption">
            <div class="lb-spread-caption-heading">
              <strong>{films[selected()].title}</strong>
              <span>{films[selected()].category}</span>
            </div>
            <p>
              <span>Prompt</span>“{films[selected()].prompt}”
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
const steps = [
  [
    '01',
    'Bring anything',
    'Start',
    'Begin with a URL, recording, document, asset, or half-formed idea. You do not have to prepare the perfect brief.',
    ['URLs & assets', 'Recordings & docs', 'Rough ideas'],
  ],
  [
    '02',
    'Build context',
    'Understand',
    'The agent researches the product, inspects your files, and works out the right medium, structure, and production plan.',
    ['Researches', 'Inspects assets', 'Chooses a pipeline'],
  ],
  [
    '03',
    'Production',
    'Make',
    'It writes, designs, records, edits, and mixes using the tools the job needs, all inside the same project.',
    ['Launch films', 'Demo recordings', 'Decks & edits'],
  ],
  [
    '04',
    'Live preview',
    'Direct',
    'Watch the work take shape. Point to an element, a moment in the timeline, or an asset and say exactly what should change.',
    ['Select anything', 'Precise feedback', 'Preview updates live'],
  ],
  [
    '05',
    'Finish',
    'Ship',
    'Keep refining in the same conversation, then export a polished video, PDF, or presentation-ready artifact.',
    ['Resumable project', 'MP4 & PDF', 'Ready to share'],
  ],
] as const

type PipelineWindow = Window & {
  __dcSetProps?: (name: string, props: Record<string, unknown>) => void
}

const AgentPipelineFrame = (props: { active: number; autoplay?: boolean }) => {
  let viewport!: HTMLDivElement
  let frame!: HTMLIFrameElement
  const [scale, setScale] = createSignal(0.82)
  let retry: number | undefined
  let attempts = 0

  const syncStep = () => {
    window.clearTimeout(retry)
    const frameWindow = frame.contentWindow as PipelineWindow | null
    const frameDocument = frame.contentDocument
    if (!frameWindow?.__dcSetProps || !frameDocument) {
      if (attempts++ < 80) retry = window.setTimeout(syncStep, 100)
      return
    }
    attempts = 0
    frameWindow.__dcSetProps('Root', { autoplay: props.autoplay ?? false, speed: 1 })
    requestAnimationFrame(() => {
      const bars = [...frameDocument.querySelectorAll<HTMLElement>('div')].filter(
        element => element.style.cursor === 'pointer' && element.style.height === '2px',
      )
      bars[props.active]?.click()
    })
  }

  onMount(() => {
    const resize = () => {
      const canvasWidth = window.innerWidth <= 768 ? 540 : 560
      setScale(viewport.clientWidth / canvasWidth)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(viewport)
    frame.addEventListener('load', syncStep)
    onCleanup(() => {
      observer.disconnect()
      frame.removeEventListener('load', syncStep)
      window.clearTimeout(retry)
    })
  })
  createEffect(() => {
    props.active
    syncStep()
  })

  return (
    <div ref={viewport} class="lb-hiw-pipeline-viewport" style={{ height: `${455 * scale()}px` }}>
      <iframe
        ref={frame}
        class="lb-hiw-pipeline-frame"
        src={new URL('../../components/landing/Agent Pipeline v2.dc.html', import.meta.url).href}
        title="Agent pipeline animation"
        tabIndex={-1}
        loading="lazy"
        style={{ transform: `scale(${scale()})` }}
      />
    </div>
  )
}

export const HowItWorks = () => {
  const [active, setActive] = createSignal(0)
  const stepElements: HTMLLIElement[] = []

  onMount(() => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
      const triggers: ScrollTrigger[] = []
      stepElements.forEach((element, index) => {
        const paint = (progress: number) => {
          const enter = gsap.utils.clamp(0, 1, progress / 0.3)
          const exit = gsap.utils.clamp(0, 1, (progress - 0.7) / 0.3)
          const visibility =
            progress < 0.3 ? enter * enter * (3 - 2 * enter) : 1 - exit * exit * (3 - 2 * exit)
          gsap.set(element, {
            autoAlpha: 0.1 + visibility * 0.9,
            y: progress < 0.3 ? 34 * (1 - visibility) : -34 * (1 - visibility),
          })
        }
        triggers.push(
          ScrollTrigger.create({
            trigger: element,
            start: 'top 88%',
            end: 'bottom 12%',
            onUpdate: self => paint(self.progress),
            onRefresh: self => paint(self.progress),
          }),
          ScrollTrigger.create({
            trigger: element,
            start: 'top 58%',
            end: 'bottom 42%',
            onToggle: self => self.isActive && setActive(index),
          }),
        )
      })
      return () => triggers.forEach(trigger => trigger.kill())
    })
    mm.add('(max-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const triggers = stepElements.map((element, index) => {
        const paint = () => {
          const rect = element.getBoundingClientRect()
          const center = rect.top + rect.height / 2
          const viewportCenter = window.innerHeight * 0.46
          const distance = Math.abs(center - viewportCenter)
          const fadeDistance = Math.max(window.innerHeight * 0.88, rect.height * 0.82)
          const visibility = 1 - gsap.utils.clamp(0, 1, distance / fadeDistance)
          const eased = visibility * visibility * (3 - 2 * visibility)
          gsap.set(element, {
            autoAlpha: 0.28 + eased * 0.72,
            filter: `blur(${(1 - eased) * 2.5}px)`,
            y: gsap.utils.clamp(-18, 18, (viewportCenter - center) * 0.035),
          })
          if (distance < window.innerHeight * 0.24) setActive(index)
        }
        return ScrollTrigger.create({
          trigger: element,
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: paint,
          onRefresh: paint,
        })
      })
      return () => {
        triggers.forEach(trigger => trigger.kill())
        stepElements.forEach(element =>
          gsap.set(element, { clearProps: 'opacity,visibility,filter,transform' }),
        )
      }
    })
    onCleanup(() => mm.revert())
  })

  return (
    <section class="lb-band lb-hiw" aria-labelledby="hiw-heading">
      <div class="lb-wrap lb-hiw-head lb-reveal">
        <p class="lb-chy">How it works</p>
        <h2 id="hiw-heading" class="lb-h2">
          One agent. Any starting point.
        </h2>
        <p class="lb-sub lb-muted">
          Research, writing, design, recording, editing, and revision in one continuous workspace.
        </p>
      </div>
      <div class="lb-wrap lb-hiw-grid">
        <div class="lb-hiw-stage" aria-hidden="true">
          <div class="lb-hiw-visual is-active">
            <AgentPipelineFrame active={active()} />
          </div>
        </div>
        <ol class="lb-hiw-steps">
          <For each={steps}>
            {(step, index) => (
              <li
                ref={element => (stepElements[index()] = element)}
                class={`lb-hiw-step${index() === active() ? ' is-active' : ''}`}
              >
                <p class="lb-hiw-num">
                  <span>{step[0]}</span>
                  {step[1]}
                </p>
                <h3>{step[2]}</h3>
                <p class="lb-hiw-body">{step[3]}</p>
                <div class="lb-hiw-chips">
                  <For each={step[4]}>{chip => <span>{chip}</span>}</For>
                </div>
                <div class="lb-hiw-inline" aria-hidden="true">
                  <AgentPipelineFrame active={index()} autoplay />
                </div>
              </li>
            )}
          </For>
        </ol>
      </div>
    </section>
  )
}
export const StudioManifesto = () => (
  <section class="lb-band lb-manifesto" id="studio">
    <div class="lb-wrap lb-reveal">
      <div class="lb-manifesto-grid">
        <div class="lb-manifesto-head">
          <p class="lb-chy">The Studio</p>
          <h2 class="lb-h2">Directable AI for presentation-ready creative work.</h2>
        </div>
        <div class="lb-manifesto-content">
          <p class="lb-manifesto-lead">
            Turn a URL, recording, document, or rough idea into a polished launch film, product
            demo, deck, or edited video.
          </p>
          <div class="lb-manifesto-columns">
            <div class="lb-manifesto-col">
              <h3 class="lb-manifesto-h3">Live, interactive workflow</h3>
              <p class="lb-manifesto-p">
                Watch the work take shape, select any element, timestamp, or asset, and request
                exact changes in plain language.
              </p>
            </div>
            <div class="lb-manifesto-col">
              <h3 class="lb-manifesto-h3">Complete creative control</h3>
              <p class="lb-manifesto-p">
                Keep every revision in one project and move from unfinished idea to
                presentation-ready work without production handoffs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
)

export const McpConnect = () => (
  <section class="lb-band lb-mcp" id="api">
    <div class="lb-wrap lb-mcp-head lb-reveal">
      <p class="lb-chy">MCP · API</p>
      <h2 class="lb-h2">Plug Pitch into your existing agents.</h2>
      <p class="lb-sub lb-muted">
        Call Pitch from Claude, Cursor, ChatGPT, or your own software over MCP and REST. Send a
        creative brief, continue the conversation, and retrieve the finished output. It’s on the
        official MCP registry as <code class="lb-mcp-name">{REGISTRY_NAME}</code>.
      </p>
    </div>
    <div class="lb-wrap lb-mcp-body-wrap lb-reveal">
      <McpSetup />
      <div class="mcp-cta">
        <a class="lb-cta lb-cta--ghost" href="/api-keys">
          Get an API key
        </a>
        <A class="lb-cta" href="/docs">
          Go to docs
        </A>
      </div>
    </div>
  </section>
)

export const LandingView = () => {
  const clerk = useClerk(),
    [logoDone, setLogoDone] = createSignal(false),
    [videoSrc, setVideoSrc] = createSignal<string | null>(null)
  let root!: HTMLDivElement
  let lenis: Lenis | undefined
  onMount(() => {
    lenis = new Lenis({
      autoRaf: false,
      anchors: true,
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.85,
      respectReducedMotion: true,
    })
    const update = (t: number) => lenis?.raf(t * 1000)
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh())
    let disposed = false
    const refresh = () => {
      if (disposed) return
      lenis?.resize()
      ScrollTrigger.refresh()
    }
    void document.fonts.ready.then(refresh)
    window.addEventListener('load', refresh, { once: true })
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('is-in')
        }),
      { threshold: 0.12 },
    )
    root.querySelectorAll('.lb-reveal').forEach(el => io.observe(el))
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVideoSrc(null)
        return
      }
      if (
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) &&
        (e.key === 'g' || e.key === 'G')
      )
        clerk.openSignIn()
    }
    window.addEventListener('keydown', key)
    onCleanup(() => {
      disposed = true
      io.disconnect()
      cancelAnimationFrame(refreshFrame)
      window.removeEventListener('keydown', key)
      window.removeEventListener('load', refresh)
      gsap.ticker.remove(update)
      gsap.ticker.lagSmoothing(500, 33)
      lenis?.off('scroll', ScrollTrigger.update)
      lenis?.destroy()
    })
  })
  createEffect(() => (videoSrc() ? lenis?.stop() : lenis?.start()))
  return (
    <>
      <Seo
        title="Pitch: The AI production studio you can direct"
        description="Pitch is a directable AI production studio that turns a URL, recording, document, asset, or rough idea into polished launch films, product demos, demo recordings, slide decks, and edited videos."
        path="/"
      />
      <div class="lb-root" ref={root}>
        <LandingNav />
        <section class="lb-band lb-hero">
          <div class="lb-hero-in">
            <h1 class="sr-only">Pitch, the AI production studio you can direct</h1>
            <div class="lb-wordmark" aria-hidden="true">
              <PitchLogoAnimation onComplete={() => setLogoDone(true)} />
              <span
                class={`lb-wordmark-credit${logoDone() ? ' is-visible' : ''}`}
                data-text="by Hormuz Labs"
              >
                by Hormuz Labs
              </span>
            </div>
            <p class="lb-hero-tag">
              <span>
                An AI production studio you can <b>direct</b>.
              </span>
            </p>
            <div class="lb-composer-wrap">
              <LandingChatInput />
            </div>
            <p class="lb-hintrow">
              Start with a prompt or file. Or{' '}
              <button
                onClick={() => setVideoSrc(carouselAsset('demo.mp4'))}
                style={{ 'text-decoration': 'underline' }}
              >
                watch one first
              </button>
              .
            </p>
          </div>
        </section>
        <div id="work">
          <ScrollSpreadFilms />
        </div>
        <StudioManifesto />
        <HowItWorks />
        <McpConnect />
        <LandingAgenC />
        <AskAboutPitch />
        <LandingFooter />
      </div>
      <Show when={videoSrc()} keyed>
        {src => (
          <Portal>
            <div
              class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
              style={{ background: 'rgba(0,0,0,.85)', 'backdrop-filter': 'blur(6px)' }}
              onClick={() => setVideoSrc(null)}
            >
              <div
                class="relative w-full max-w-4xl rounded-2xl overflow-hidden"
                style={{ 'aspect-ratio': '16/9' }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  class="absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/30 bg-black/70 text-xl text-white hover:bg-black/90"
                  aria-label="Close video"
                  onClick={() => setVideoSrc(null)}
                >
                  ×
                </button>
                <video
                  src={src}
                  poster={src.endsWith('/demo.mp4') ? demoThumbnail : undefined}
                  class="w-full h-full object-cover"
                  autoplay
                  controls
                  playsinline
                />
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </>
  )
}
