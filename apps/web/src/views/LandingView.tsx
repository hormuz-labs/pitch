import { useAuth, useClerk } from '@clerk/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useEffect, useRef, useState } from 'react'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { carouselAsset } from '../components/landing/carouselAssets'
import { HowItWorks } from '../components/landing/HowItWorks'
import { LandingChatInput } from '../components/landing/LandingChatInput'
import { McpConnect } from '../components/landing/McpConnect'
import { ScrollSpreadFilms } from '../components/landing/ScrollSpreadFilms'
import { PitchLogoAnimation } from '../components/PitchLogoAnimation'
import { Seo } from '../components/Seo'
import '../styles/landing.css'
import '../styles/landing-broadcast.css'
import demoThumbnail from '../assets/demo-thumbnail.jpg'

// Streamed from the same public bucket as the carousel films rather than
// bundled. The local copy was a 24.7 MB asset emitted into every deploy for a
// video that only plays if a visitor opens the "watch one first" modal.
const demoVideo = carouselAsset('demo.mp4')

gsap.registerPlugin(ScrollTrigger)

export const LandingView = () => {
  const clerk = useClerk()
  const { isSignedIn } = useAuth()
  const [heroLogoDone, setHeroLogoDone] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lenisRef = useRef<Lenis | null>(null)

  // Lenis and GSAP share one ticker so pinned ScrollTriggers read the exact
  // same interpolated scroll position that is painted to the page.
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: false,
      anchors: true,
      // A restrained lerp keeps long landing-page passes fluid without making
      // controls feel detached from the wheel or trackpad.
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.85,
      touchMultiplier: 1,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      overscroll: true,
      syncTouch: false,
      respectReducedMotion: true,
    })
    lenisRef.current = lenis

    const update = (time: number) => lenis.raf(time * 1000)
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)

    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh())
    let disposed = false
    void document.fonts.ready.then(() => {
      if (disposed) return
      lenis.resize()
      ScrollTrigger.refresh()
    })

    const refreshAfterLoad = () => {
      lenis.resize()
      ScrollTrigger.refresh()
    }
    window.addEventListener('load', refreshAfterLoad, { once: true })

    return () => {
      disposed = true
      cancelAnimationFrame(refreshFrame)
      window.removeEventListener('load', refreshAfterLoad)
      gsap.ticker.remove(update)
      gsap.ticker.lagSmoothing(500, 33)
      lenis.off('scroll', ScrollTrigger.update)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  useEffect(() => {
    if (videoOpen) lenisRef.current?.stop()
    else lenisRef.current?.start()
  }, [videoOpen])

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideoOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Keyboard shortcut: G → open sign-in modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'g' || e.key === 'G') clerk.openSignIn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clerk])

  // Lightweight scroll reveal
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.lb-reveal')
    if (!els?.length) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <Seo
        title="Pitch: An agent uses your product, then films the demo"
        description="Give Pitch a URL and a paragraph of direction. An AI agent runs the real flows in a browser, narrates what happened, and cuts a scored 1080p demo video in minutes. No recording. No editing."
        path="/"
      />
      <div className="lb-root" ref={rootRef}>
        <LandingNav />

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="lb-band lb-hero" aria-labelledby="hero-heading">
          <div className="lb-hero-in">
            <h1 id="hero-heading" className="sr-only">
              Pitch, an agent that uses your product, then films the demo
            </h1>
            <div className="lb-wordmark" aria-hidden="true">
              <PitchLogoAnimation
                startAnimation
                loop={false}
                onComplete={() => setHeroLogoDone(true)}
              />
              <span
                className={`lb-wordmark-credit${heroLogoDone ? ' is-visible' : ''}`}
                data-text="by Hormuz Labs"
              >
                by Hormuz Labs
              </span>
            </div>
            <p className="lb-hero-tag">
              A <b>frontier</b> agent that visits your product, runs the real flows, and films the
              demo.
            </p>

            <div className="lb-composer-wrap">
              <LandingChatInput />
            </div>

            <p className="lb-hintrow">
              First render is on the house. No card. Or{' '}
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  font: 'inherit',
                  color: 'inherit',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  cursor: 'pointer',
                }}
              >
                watch one first
              </button>
              .
            </p>
          </div>
        </section>

        {/* ── Films — single video spreads into a fan on scroll ── */}
        <div id="work">
          <ScrollSpreadFilms />
        </div>

        {/* ── How it works — sticky left panel, scrolling steps ── */}
        <HowItWorks />

        {/* ── MCP / API — connect to existing agents ───────────── */}
        <McpConnect />

        {/* ── Endcap ───────────────────────────────────────────── */}
        <section className="lb-band lb-endcap">
          <div className="lb-endcap-inner">
            <div className="lb-endcap-copy">
              <h2 className="lb-endcap-title">
                Your next demo is
                <br /> one <em>sentence</em> away.
              </h2>
              <div className="lb-endcap-actions">
                <a
                  className="lb-endcap-link"
                  href="mailto:support@trypitch.co?subject=Pitch%20demo"
                >
                  Book a demo
                </a>
                <a href={isSignedIn ? '/new' : '/sign-up'} className="lb-endcap-primary">
                  {isSignedIn ? 'Open dashboard' : 'Get started'}
                </a>
              </div>
            </div>
            <div className="lb-endcap-word" aria-hidden="true">
              PITCH
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>

      {/* ── Video Modal ──────────────────────────────────────────── */}
      {videoOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={() => setVideoOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl"
            style={{ aspectRatio: '16/9' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setVideoOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors border-none cursor-pointer"
              aria-label="Close video"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <video
              ref={videoRef}
              src={demoVideo}
              poster={demoThumbnail}
              preload="none"
              className="w-full h-full object-cover"
              autoPlay
              controls
              playsInline
            />
          </div>
        </div>
      )}
    </>
  )
}
