import { useAuth, useClerk } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import { DoubleStairPreloader } from '../components/DoubleStairPreloader'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { HowItWorks } from '../components/landing/HowItWorks'
import { LandingChatInput } from '../components/landing/LandingChatInput'
import { LandingFaqAccordion } from '../components/landing/LandingFaqAccordion'
import { McpConnect } from '../components/landing/McpConnect'
import { ScrollSpreadFilms } from '../components/landing/ScrollSpreadFilms'
import { PitchLogoAnimation } from '../components/PitchLogoAnimation'
import { Seo } from '../components/Seo'
import '../styles/landing.css'
import '../styles/landing-broadcast.css'
import demoVideo from '../assets/demo.mp4'
import demoThumbnail from '../assets/demo-thumbnail.jpg'

export const LandingView = () => {
  const clerk = useClerk()
  const { isSignedIn } = useAuth()
  const [, setPreloaderDone] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

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
        title="Pitch — An agent uses your product, then films the demo"
        description="Give Pitch a URL and a paragraph of direction. An AI agent runs the real flows in a browser, narrates what happened, and cuts a scored 1080p demo video in minutes. No recording. No editing."
        path="/"
      />
      <DoubleStairPreloader onComplete={() => setPreloaderDone(true)} />

      <div className="lb-root" ref={rootRef}>
        <LandingNav />

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="lb-band lb-hero" aria-labelledby="hero-heading">
          <div className="lb-hero-in">
            <h1 id="hero-heading" className="sr-only">
              Pitch — an agent that uses your product, then films the demo
            </h1>
            <div className="lb-wordmark" aria-hidden="true">
              <PitchLogoAnimation startAnimation loop={false} />
            </div>
            <p className="lb-hero-tag">
              A <b>frontier</b> agent that visits your product, runs the real flows, and films the
              demo.
            </p>

            <div className="lb-composer-wrap">
              <LandingChatInput />
            </div>

            <p className="lb-hintrow">
              First render is on the house — no card. Or{' '}
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

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section id="faq" className="lb-band lb-interview" aria-labelledby="faq-heading">
          <div className="lb-wrap lb-reveal">
            <p className="lb-chy">FAQ</p>
            <h2 id="faq-heading" className="lb-h2">
              Questions.
            </h2>
          </div>
          <div className="lb-wrap">
            <LandingFaqAccordion />
          </div>
        </section>

        {/* ── Endcap ───────────────────────────────────────────── */}
        <section className="lb-band lb-endcap">
          <div className="lb-wrap lb-reveal">
            <div className="lb-endcap-box">
              <h2 className="lb-h2">Point it at your site.</h2>
              <p className="lb-endcap-sub">
                One URL in, a narrated 1080p demo out. First render is free.
              </p>
              <a href={isSignedIn ? '/dashboard' : '/sign-up'} className="lb-cta">
                {isSignedIn ? 'Open dashboard' : 'Send the agent'}
              </a>
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
