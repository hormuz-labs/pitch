import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { A, useNavigate } from '@solidjs/router'
import {
  ArrowUp,
  Clapperboard,
  Code2,
  Compass,
  Crosshair,
  MonitorPlay,
  Presentation,
} from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import demoThumbnail from '../../assets/demo-thumbnail.jpg'
import { useAuth, useClerk } from '../core/auth'
import { Seo } from '../core/Seo'
import { PitchLogoAnimation } from './brand'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import { McpSetup, REGISTRY_NAME } from './McpSetup'
import { carouselAsset } from './productCatalog'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'

gsap.registerPlugin(ScrollTrigger)
type Agent = 'launch-video' | 'demo-video' | 'pdf-maker'
const AGENTS = {
  'launch-video': { label: 'Launch Video', href: '/new?flow=launch-video', icon: Clapperboard },
  'demo-video': { label: 'Demo Video', href: '/new?flow=demo-video', icon: MonitorPlay },
  'pdf-maker': { label: 'PDF Maker', href: '/new?flow=deck', icon: Presentation },
}
const suggestions = [
  [
    'Launch video',
    'launch-video',
    Clapperboard,
    'Make a 60-second cinematic launch video for https://trypitch.co',
  ],
  [
    'Product walkthrough',
    'demo-video',
    MonitorPlay,
    'Record a narrated walkthrough of the core flow on https://trypitch.co',
  ],
  [
    'Onboarding tour',
    'demo-video',
    Compass,
    'Give a guided tour of the sign-up and onboarding flow on https://trypitch.co',
  ],
  [
    'Feature deep-dive',
    'demo-video',
    Crosshair,
    'Do a focused deep-dive on the main feature of https://trypitch.co',
  ],
  [
    'Investor deck',
    'pdf-maker',
    Presentation,
    'Create a 10-slide investor pitch deck for https://trypitch.co',
  ],
  [
    'API demo',
    'demo-video',
    Code2,
    'Demonstrate the API and developer experience of https://trypitch.co',
  ],
] as const
const placeholders: Record<Agent, string[]> = {
  'launch-video': [
    'Make a 60-second cinematic launch video for https://trypitch.co',
    'Create an upbeat product reveal video for https://trypitch.co',
  ],
  'demo-video': [
    'Walk through the onboarding and sign-up flow on https://trypitch.co',
    'Create a narrated feature walkthrough of https://trypitch.co',
  ],
  'pdf-maker': [
    'Create a 10-slide seed round investor pitch deck for an AI startup',
    'Make a sleek product one-pager presentation for our enterprise tier',
  ],
}
const isSigned = (auth: ReturnType<typeof useAuth>) =>
  typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn

export const LandingChatInput = () => {
  const auth = useAuth(),
    navigate = useNavigate(),
    [input, setInput] = createSignal(''),
    [agent, setAgent] = createSignal<Agent>('launch-video'),
    [focused, setFocused] = createSignal(false),
    [open, setOpen] = createSignal(false),
    [hint, setHint] = createSignal('')
  let area!: HTMLTextAreaElement
  let timer: number | undefined
  createEffect(() => {
    clearTimeout(timer)
    if (input()) return
    const full = placeholders[agent()][0]
    setHint('')
    let i = 0
    const type = () => {
      setHint(full.slice(0, ++i))
      if (i < full.length) timer = window.setTimeout(type, 30)
    }
    type()
  })
  onCleanup(() => clearTimeout(timer))
  const send = () => {
    const base = AGENTS[agent()].href,
      dest = input().trim() ? `${base}&prompt=${encodeURIComponent(input().trim())}` : base
    navigate(isSigned(auth) ? dest : `/sign-up?redirect=${encodeURIComponent(dest)}`)
  }
  return (
    <div class="landing-chat-root">
      <div class={`landing-chat-card${focused() ? ' landing-chat-card--focused' : ''}`}>
        <div class="landing-chat-inner">
          <div class="landing-chat-textarea-wrap">
            <textarea
              ref={area}
              value={input()}
              rows="1"
              onInput={e => setInput(e.currentTarget.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              class="landing-chat-textarea"
              aria-label="AI prompt"
            />
            <Show when={!input()}>
              <div class="landing-chat-placeholder-overlay" onClick={() => area.focus()}>
                <span class="landing-chat-placeholder-text">
                  {hint()}
                  <span class="landing-chat-typing-cursor">|</span>
                </span>
              </div>
            </Show>
          </div>
          <div class="landing-chat-toolbar">
            <span />
            <div class="landing-chat-toolbar-right">
              <button class="landing-chat-dropdown-trigger" onClick={() => setOpen(!open())}>
                {AGENTS[agent()].label}
              </button>
              <button
                class={`landing-chat-submit${input().trim() ? ' landing-chat-submit--active' : ''}`}
                onClick={send}
              >
                <ArrowUp size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <Show when={open()}>
        <div class="landing-chat-dropdown-menu" role="listbox">
          <For each={Object.entries(AGENTS)}>
            {([value, item]) => (
              <button
                class="landing-chat-dropdown-option"
                onClick={() => {
                  setAgent(value as Agent)
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="landing-chat-suggestions">
        <For each={suggestions}>
          {s => {
            const Icon = s[2]
            return (
              <button
                class="landing-chat-suggestion"
                onClick={() => {
                  setAgent(s[1])
                  setInput(s[3])
                  area.focus()
                }}
              >
                <Icon size={13} />
                {s[0]}
              </button>
            )
          }}
        </For>
      </div>
    </div>
  )
}

const films = [
  'graphify.mp4',
  'gtmcofounder.mp4',
  'supermemory.mp4',
  'unsloth-launch.mp4',
  'demo.mp4',
]
export const ScrollSpreadFilms = () => (
  <section class="lb-band lb-spread" aria-labelledby="films-heading">
    <div class="lb-spread-inner">
      <div class="lb-spread-header lb-wrap">
        <p class="lb-chy">URL to film</p>
        <h2 id="films-heading" class="lb-h2">
          A sentence in. <i>A film out.</i>
        </h2>
        <p class="lb-sub lb-muted">
          One URL and a line of direction. Every clip still carries the brief that made it.
        </p>
      </div>
      <div class="lb-spread-carousel">
        <div class="flex gap-4 overflow-x-auto px-[10vw] py-10 snap-x">
          <For each={films}>
            {(src, i) => (
              <video
                src={carouselAsset(src)}
                muted
                loop
                playsinline
                autoplay
                preload={i() === 0 ? 'metadata' : 'none'}
                class="snap-center shrink-0 rounded-2xl shadow-xl w-[clamp(260px,40vw,520px)] aspect-video object-cover"
              />
            )}
          </For>
        </div>
      </div>
    </div>
  </section>
)
const steps = [
  [
    '01',
    'The brief',
    'Prompt',
    'Describe the demo in one sentence and drop the URL. No storyboard, no script to write.',
  ],
  [
    '02',
    'Understanding',
    'Research',
    'The agent reads your site and brand: real colours, type and tone, plus the flows actually worth showing.',
  ],
  [
    '03',
    'Direction',
    'Plan',
    'It storyboards the cut scene by scene, with pacing, a shot list and narration.',
  ],
  [
    '04',
    'Production',
    'Shoot',
    'It drives the real product, records every scene, then narrates, scores and colour-grades a 1080p cut.',
  ],
  [
    '05',
    'Iterate',
    'Edit',
    'Swap a voice, trim a scene, restyle a caption. No full re-render, no hallucinated frames.',
  ],
]
export const HowItWorks = () => (
  <section class="lb-band lb-hiw">
    <div class="lb-wrap lb-hiw-head lb-reveal">
      <p class="lb-chy">How it works</p>
      <h2 class="lb-h2">One agent. Idea to finished cut.</h2>
      <p class="lb-sub lb-muted">
        Research, planning, shooting, voiceover, scoring and edit. One pass, one place.
      </p>
    </div>
    <div class="lb-wrap lb-hiw-grid">
      <div class="lb-hiw-stage">
        <div class="lb-hiw-visual is-active">
          <iframe
            class="lb-hiw-pipeline-frame"
            src={
              new URL('../../components/landing/Agent Pipeline v2.dc.html', import.meta.url).href
            }
            title="Agent pipeline animation"
            loading="lazy"
          />
        </div>
      </div>
      <ol class="lb-hiw-steps">
        <For each={steps}>
          {s => (
            <li class="lb-hiw-step is-active">
              <p class="lb-hiw-num">
                <span>{s[0]}</span>
                {s[1]}
              </p>
              <h3>{s[2]}</h3>
              <p class="lb-hiw-body">{s[3]}</p>
            </li>
          )}
        </For>
      </ol>
    </div>
  </section>
)
export const McpConnect = () => (
  <section class="lb-band lb-mcp" id="api">
    <div class="lb-wrap lb-mcp-head lb-reveal">
      <p class="lb-chy">MCP · API</p>
      <h2 class="lb-h2">Plug Pitch into your existing agents.</h2>
      <p class="lb-sub lb-muted">
        Call Pitch from Claude, Cursor, ChatGPT or any agent over MCP. It visits the URL, films the
        demo and hands the file back. It’s on the official MCP registry as{' '}
        <code class="lb-mcp-name">{REGISTRY_NAME}</code>.
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
  const auth = useAuth(),
    clerk = useClerk(),
    [logoDone, setLogoDone] = createSignal(false),
    [videoOpen, setVideoOpen] = createSignal(false)
  let root!: HTMLDivElement
  let lenis: Lenis | undefined
  onMount(() => {
    lenis = new Lenis({
      autoRaf: false,
      anchors: true,
      lerp: 0.085,
      smoothWheel: true,
      respectReducedMotion: true,
    })
    const update = (t: number) => lenis?.raf(t * 1000)
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(update)
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('is-in')
        }),
      { threshold: 0.12 },
    )
    root.querySelectorAll('.lb-reveal').forEach(el => io.observe(el))
    const key = (e: KeyboardEvent) => {
      if (
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) &&
        (e.key === 'g' || e.key === 'G')
      )
        clerk.openSignIn()
    }
    window.addEventListener('keydown', key)
    onCleanup(() => {
      io.disconnect()
      window.removeEventListener('keydown', key)
      gsap.ticker.remove(update)
      lenis?.destroy()
    })
  })
  createEffect(() => (videoOpen() ? lenis?.stop() : lenis?.start()))
  return (
    <>
      <Seo
        title="Pitch: An agent uses your product, then films the demo"
        description="Give Pitch a URL and a paragraph of direction. An AI agent runs the real flows in a browser, narrates what happened, and cuts a scored 1080p demo video in minutes."
        path="/"
      />
      <div class="lb-root" ref={root}>
        <LandingNav />
        <section class="lb-band lb-hero">
          <div class="lb-hero-in">
            <h1 class="sr-only">Pitch, an agent that uses your product, then films the demo</h1>
            <div class="lb-wordmark">
              <PitchLogoAnimation onComplete={() => setLogoDone(true)} />
              <span class={`lb-wordmark-credit${logoDone() ? ' is-visible' : ''}`}>
                by Hormuz Labs
              </span>
            </div>
            <p class="lb-hero-tag">
              A <b>frontier</b> agent that visits your product, runs the real flows, and films the
              demo.
            </p>
            <div class="lb-composer-wrap">
              <LandingChatInput />
            </div>
            <p class="lb-hintrow">
              First render is on the house. No card. Or{' '}
              <button onClick={() => setVideoOpen(true)} style={{ 'text-decoration': 'underline' }}>
                watch one first
              </button>
              .
            </p>
          </div>
        </section>
        <div id="work">
          <ScrollSpreadFilms />
        </div>
        <HowItWorks />
        <McpConnect />
        <section class="lb-band lb-endcap">
          <div class="lb-endcap-inner">
            <div class="lb-endcap-copy">
              <h2 class="lb-endcap-title">
                Your next demo is
                <br /> one <em>sentence</em> away.
              </h2>
              <div class="lb-endcap-actions">
                <a class="lb-endcap-link" href="mailto:support@trypitch.co?subject=Pitch%20demo">
                  Book a demo
                </a>
                <A href={isSigned(auth) ? '/new' : '/sign-up'} class="lb-endcap-primary">
                  {isSigned(auth) ? 'Open dashboard' : 'Get started'}
                </A>
              </div>
            </div>
            <div class="lb-endcap-word">PITCH</div>
          </div>
        </section>
        <LandingFooter />
      </div>
      <Show when={videoOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
            style={{ background: 'rgba(0,0,0,.85)', 'backdrop-filter': 'blur(6px)' }}
            onClick={() => setVideoOpen(false)}
          >
            <div
              class="relative w-full max-w-4xl rounded-2xl overflow-hidden"
              style={{ 'aspect-ratio': '16/9' }}
              onClick={e => e.stopPropagation()}
            >
              <button
                class="absolute top-3 right-3 z-10 text-white"
                onClick={() => setVideoOpen(false)}
              >
                ×
              </button>
              <video
                src={carouselAsset('demo.mp4')}
                poster={demoThumbnail}
                class="w-full h-full object-cover"
                autoplay
                controls
                playsinline
              />
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
