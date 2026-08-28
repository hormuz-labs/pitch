import { useAuth, useClerk } from '@clerk/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef, useState } from 'react'
import { DoubleStairPreloader } from '../components/DoubleStairPreloader'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { LandingChatInput } from '../components/landing/LandingChatInput'
import { LandingFaqAccordion } from '../components/landing/LandingFaqAccordion'
import { Step1Illustration } from '../components/landing/Step1Illustration'
import { Step2Illustration } from '../components/landing/Step2Illustration'
import { Step3Illustration } from '../components/landing/Step3Illustration'
import { StepCard } from '../components/landing/StepCard'
import { VideoCarousel } from '../components/landing/VideoCarousel'

import { PitchLogoAnimation } from '../components/PitchLogoAnimation'
import { Process } from '../components/Process'
import { Seo } from '../components/Seo'
import { TextGenerateEffect } from '../components/ui/text-generate-effect'
import { useStepSequence } from '../hooks/useStepSequence'
import '../styles/landing.css'
import demoVideo from '../assets/demo.mp4'
import demoThumbnail from '../assets/demo-thumbnail.jpg'

gsap.registerPlugin(ScrollTrigger)

export const LandingView = () => {
  const clerk = useClerk()
  const { isSignedIn } = useAuth()
  const [preloaderDone, setPreloaderDone] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const seq = useStepSequence(3)
  const hiwRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Close modal on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideoOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // GSAP ScrollTrigger — How It Works section
  useEffect(() => {
    if (!hiwRef.current) return

    const ctx = gsap.context(() => {
      // Header
      const hiwHeader = gsap.utils.toArray('.landing-hiw-header')
      if (hiwHeader.length > 0) {
        gsap.from(hiwHeader, {
          opacity: 0,
          y: 40,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.landing-hiw-header',
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        })
      }

      // Step cards — staggered
      const stepCards = gsap.utils.toArray('.landing-step-card')
      if (stepCards.length > 0) {
        gsap.from(stepCards, {
          opacity: 0,
          y: 52,
          duration: 0.75,
          ease: 'power3.out',
          stagger: 0.13,
          scrollTrigger: {
            trigger: '.landing-hiw-grid',
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
        })
      }
    }, hiwRef)

    return () => ctx.revert()
  }, [])

  // Start card sequence when How It Works section enters view
  useEffect(() => {
    if (!hiwRef.current) return
    const st = ScrollTrigger.create({
      trigger: hiwRef.current,
      start: 'top 70%',
      once: true,
      onEnter: () => seq.start(),
    })
    return () => st.kill()
  }, [seq.start])

  // Keyboard shortcut: G → open sign-in modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'g' || e.key === 'G') clerk.openSignIn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clerk])

  return (
    <>
      <Seo
        title="Pitch — Turn any URL into a cinematic product demo video"
        description="An AI agent navigates your live product, writes the script, and renders a narrated 1080p demo video in minutes. No recording. No editing."
        path="/"
      />
      <DoubleStairPreloader onComplete={() => setPreloaderDone(true)} />

      <div className="landing-root landing-grain">
        <LandingNav />

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="landing-hero-left" style={{ maxWidth: '100%' }}>
            <div className="flex flex-col lg:flex-row items-center justify-between w-full gap-8 lg:gap-16 mt-4">
              <div className="flex flex-col items-center text-center flex-1 max-w-xl">
                <div
                  className="landing-hero-logo-wrap landing-animate-1"
                  aria-hidden="true"
                  style={{ margin: '0 auto 24px auto' }}
                >
                  <PitchLogoAnimation startAnimation={preloaderDone} />
                </div>

                <TextGenerateEffect
                  words="What if your website could pitch itself? Just drop your URL, describe what you want, and our AI agent does the rest — visiting your site, crafting the script, and delivering a professional, narrated pitch video in minutes."
                  highlights={['pitch', 'itself', 'AI', 'agent', 'narrated', 'video']}
                  className="landing-subtitle landing-animate-3 !m-0"
                />

                <div className="landing-ctas landing-animate-4 mt-8 flex-wrap justify-center w-full">
                  {isSignedIn ? (
                    <a href="/dashboard" className="landing-btn-primary">
                      Dashboard
                    </a>
                  ) : (
                    <a href="/sign-up" className="landing-btn-primary">
                      Generate a demo
                    </a>
                  )}
                  <button className="landing-btn-secondary" onClick={() => setVideoOpen(true)}>
                    Watch a sample
                  </button>
                </div>
              </div>

              <div className="flex-1 w-full max-w-3xl landing-animate-5">
                <Process />
              </div>
            </div>
          </div>

          {/* AI Chatbox — positioned at the bottom of the front landing page */}
          <div className="landing-hero-chat-wrap landing-animate-5">
            <LandingChatInput />
          </div>
        </section>

        {/* ── Demo Carousel ────────────────────────────────────── */}
        <section className="landing-carousel" aria-label="More demos">
          <VideoCarousel />
        </section>

        {/* ── How It Works ─────────────────────────────────────── */}
        <section ref={hiwRef} className="landing-hiw" aria-labelledby="hiw-heading">
          <div className="landing-hiw-inner">
            <div className="landing-hiw-header">
              <div>
                <p className="landing-hiw-eyebrow">01 — How it works</p>
                <h2 id="hiw-heading" className="landing-hiw-heading">
                  Lights. Script. Render.
                </h2>
              </div>
              <p className="landing-hiw-tagline">
                No editing timeline. No actors. No script doctors. Just one agent that browses,
                narrates, and renders.
              </p>
            </div>

            <div className="landing-hiw-grid">
              <StepCard
                numeral="i."
                step="Step 01"
                title="Drop your URL"
                description="Point the agent at your live product. It opens a real browser, navigates flows, and waits for state."
                {...seq.cardProps(0)}
              >
                <Step1Illustration {...seq.stepProps(0)} />
              </StepCard>

              <StepCard
                numeral="ii."
                step="Step 02"
                title="Direct the scene"
                description="Tell the agent in plain English. Pick a voice, a theme, the pace. Subtitles optional."
                {...seq.cardProps(1)}
              >
                <Step2Illustration {...seq.stepProps(1)} />
              </StepCard>

              <StepCard
                numeral="iii."
                step="Step 03"
                title="Receive the cut"
                description="Get a narrated, scored, color-graded 1080p MP4. Edit captions, swap voices, or re-render any scene."
                {...seq.cardProps(2)}
              >
                <Step3Illustration {...seq.stepProps(2)} />
              </StepCard>
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────── */}
        <section className="landing-faq" aria-labelledby="faq-heading">
          <div className="landing-faq-inner">
            <div className="landing-faq-header">
              <div>
                <p className="landing-hiw-eyebrow">02 — Questions</p>
                <h2 id="faq-heading" className="landing-hiw-heading">
                  Asked &amp; answered.
                </h2>
              </div>
              <p className="landing-hiw-tagline">
                Quick context on how Pitch works, what it costs, and how it differs from Loom,
                Synthesia, and the rest.
              </p>
            </div>

            <div className="landing-faq-list">
              <LandingFaqAccordion />
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>

      {/* ── Video Modal ─────────────────────────────────────────────────────── */}
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
            {/* Close button */}
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
