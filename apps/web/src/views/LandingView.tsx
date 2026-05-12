import { useClerk, useAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PitchLogoAnimation } from '../components/PitchLogoAnimation';
import { DoubleStairPreloader } from '../components/DoubleStairPreloader';
import { LandingNav } from '../components/landing/LandingNav';
import { VideoPlayerMockup } from '../components/landing/VideoPlayerMockup';
import { StepCard } from '../components/landing/StepCard';
import { Step1Illustration } from '../components/landing/Step1Illustration';
import { Step2Illustration } from '../components/landing/Step2Illustration';
import { Step3Illustration } from '../components/landing/Step3Illustration';
import { Footer } from '../components/Footer';
import '../styles/landing.css';

gsap.registerPlugin(ScrollTrigger);

export const LandingView = () => {
  const clerk = useClerk();
  const { isSignedIn } = useAuth();
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [activeCard, setActiveCard] = useState<0 | 1 | 2 | 3>(0);
  const hiwRef = useRef<HTMLElement>(null);

  // GSAP ScrollTrigger — How It Works section
  useEffect(() => {
    if (!hiwRef.current) return;

    const ctx = gsap.context(() => {
      // Header
      gsap.from('.landing-hiw-header', {
        opacity: 0,
        y: 40,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.landing-hiw-header',
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });

      // Step cards — staggered
      gsap.from('.gsap-fade-up', {
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
      });
    }, hiwRef);

    return () => ctx.revert();
  }, []);

  // Start card sequence when How It Works section enters view
  useEffect(() => {
    if (!hiwRef.current) return;
    const st = ScrollTrigger.create({
      trigger: hiwRef.current,
      start: 'top 70%',
      once: true,
      onEnter: () => setActiveCard(1),
    });
    return () => st.kill();
  }, []);

  // Keyboard shortcut: G → open sign-in modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'g' || e.key === 'G') clerk.openSignIn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clerk]);

  return (
    <>
      <DoubleStairPreloader onComplete={() => setPreloaderDone(true)} />

      <div className="landing-root landing-grain">

        <LandingNav />

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="landing-hero-left">
            <div className="landing-hero-logo-wrap landing-animate-1" aria-hidden="true">
              <PitchLogoAnimation startAnimation={preloaderDone} />
            </div>

            <h1 id="hero-heading" className="landing-headline-serif landing-animate-2">
              incredible.
            </h1>

            <p className="landing-subtitle landing-animate-3">
              What if your website could <strong>pitch itself</strong>? Just drop your URL,
              describe what you want, and our <strong>AI agent</strong> does the rest —
              visiting your site, crafting the script, and delivering a professional,{' '}
              <strong>narrated pitch video</strong> in minutes.
            </p>

            <div className="landing-ctas landing-animate-4">
              {isSignedIn ? (
                <a href="/dashboard" className="landing-btn-primary">Go to dashboard</a>
              ) : (
                <a href="/sign-up" className="landing-btn-primary">Generate a demo</a>
              )}
              <button className="landing-btn-secondary">Watch a sample</button>
            </div>
          </div>

          <div className="landing-hero-right landing-animate-6">
            <VideoPlayerMockup />
          </div>

          {/* Scroll cue */}
          <div className="landing-hero-scroll-cue" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </section>

        {/* ── How It Works ─────────────────────────────────────── */}
        <section ref={hiwRef} className="landing-hiw" aria-labelledby="hiw-heading">
          <div className="landing-hiw-inner">
            <div className="landing-hiw-header">
              <div>
                <p className="landing-hiw-eyebrow">01 — How it works</p>
                <h2 id="hiw-heading" className="landing-hiw-heading">Lights. Script. Render.</h2>
              </div>
              <p className="landing-hiw-tagline">
                No editing timeline. No actors. No script doctors.
                Just one agent that browses, narrates, and renders.
              </p>
            </div>

            <div className="landing-hiw-grid">
              <StepCard numeral="i." step="Step 01" title="Drop your URL"
                description="Point the agent at your live product. It opens a real browser, navigates flows, and waits for state.">
                <Step1Illustration active={activeCard === 1} onComplete={() => setActiveCard(2)} />
              </StepCard>

              <StepCard numeral="ii." step="Step 02" title="Direct the scene"
                description="Tell the agent in plain English. Pick a voice, a theme, the pace. Subtitles optional.">
                <Step2Illustration active={activeCard === 2} onComplete={() => setActiveCard(3)} />
              </StepCard>

              <StepCard numeral="iii." step="Step 03" title="Receive the cut"
                description="Get a narrated, scored, color-graded 1080p MP4. Edit captions, swap voices, or re-render any scene.">
                <Step3Illustration active={activeCard === 3} onComplete={() => setActiveCard(0)} />
              </StepCard>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};
