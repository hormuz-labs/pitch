/**
 * HowItWorks — scrollytelling. The left panel sticks and crossfades its mockup
 * to whichever numbered step owns the centre of the screen; the right column
 * scrolls its steps through a GSAP fade-in-on-enter / fade-out-on-exit. Each
 * left mockup animates its own contents in when it becomes active (CSS, keyed
 * off `.is-active`). Below 769px it collapses to a plain stacked list.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef, useState } from 'react'
import agentPipelineUrl from './Agent Pipeline v2.dc.html?url'

gsap.registerPlugin(ScrollTrigger)

const cx = (...c: (string | false)[]) => c.filter(Boolean).join(' ')

const PIPELINE_CROP_WIDTH = 560
const PIPELINE_CROP_HEIGHT = 455

type DcFrameWindow = Window & {
  __dcSetProps?: (name: string, props: Record<string, unknown>) => void
}

/**
 * The supplied DC composition includes its own right-hand copy. This viewport
 * deliberately crops to the animated pipeline on the left; the page's native
 * scrollytelling column remains the accessible source of step content.
 */
const AgentPipelineFrame = ({ active }: { active: number }) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(0.82)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const resize = () => setScale(viewport.clientWidth / PIPELINE_CROP_WIDTH)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    const syncStep = () => {
      const frame = frameRef.current
      const frameWindow = frame?.contentWindow as DcFrameWindow | null
      const frameDocument = frame?.contentDocument
      if (!frameWindow?.__dcSetProps || !frameDocument) {
        if (attempts++ < 80) retry = setTimeout(syncStep, 100)
        return
      }

      frameWindow.__dcSetProps('Root', { autoplay: false, speed: 1 })
      requestAnimationFrame(() => {
        const bars = Array.from(frameDocument.querySelectorAll<HTMLElement>('div')).filter(
          element => element.style.cursor === 'pointer' && element.style.height === '2px',
        )
        bars[active]?.click()
      })
    }

    const onBoot = (event: MessageEvent) => {
      if (event.source === frameRef.current?.contentWindow && event.data?.type === '__dc_booted') {
        syncStep()
      }
    }

    window.addEventListener('message', onBoot)
    syncStep()
    return () => {
      window.removeEventListener('message', onBoot)
      if (retry) clearTimeout(retry)
    }
  }, [active])

  return (
    <div
      className="lb-hiw-pipeline-viewport"
      ref={viewportRef}
      style={{ height: PIPELINE_CROP_HEIGHT * scale }}
    >
      <iframe
        ref={frameRef}
        className="lb-hiw-pipeline-frame"
        src={agentPipelineUrl}
        title="Agent pipeline animation"
        tabIndex={-1}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  )
}

/* ── left panels ─────────────────────────────────────────────── */

const PromptMock = () => (
  <div className="hiw-mock hiw-composer">
    <p className="hiw-composer-text hiw-in">
      Make a narrated walkthrough of the sign-up flow on <b>trypitch.co</b>
    </p>
    <div className="hiw-composer-row hiw-stagger">
      <span className="hiw-tag hiw-in">demo</span>
      <span className="hiw-tag hiw-in">voice · warm</span>
      <span className="hiw-tag hiw-in">1080p</span>
      <span className="hiw-send hiw-in" aria-hidden="true">
        ↑
      </span>
    </div>
  </div>
)

const PALETTE = ['#0d1017', '#5b5f66', '#8c9297', '#d9ccac', '#f0efec']

const ResearchMock = () => (
  <div className="hiw-mock hiw-research">
    <p className="hiw-r-head hiw-in">
      <span className="hiw-r-dot" /> Reading <b>trypitch.co</b> and the brand
    </p>
    <div className="hiw-r-rows hiw-stagger">
      <div className="hiw-r-row hiw-in">
        <span className="hiw-r-ico" />
        <span>
          trypitch.co<em>the product you pointed us at</em>
        </span>
      </div>
      <div className="hiw-r-row hiw-in">
        <span className="hiw-r-ico" />
        <span>
          @trypitch<em>voice, tone, launch history</em>
        </span>
      </div>
    </div>
    <p className="hiw-r-label hiw-in">Brand palette</p>
    <div className="hiw-palette hiw-stagger">
      {PALETTE.map((c, i) => (
        <span key={c} className="hiw-in" style={{ transitionDelay: `${0.28 + i * 0.05}s` }}>
          <i style={{ background: c }} />
          {c}
        </span>
      ))}
    </div>
    <p className="hiw-r-label hiw-in">Reference frames</p>
    <div className="hiw-r-frames hiw-stagger">
      <span className="hiw-in" />
      <span className="hiw-in" />
      <span className="hiw-in" />
    </div>
  </div>
)

const SCENES = [
  ['01', 'Cold open', '0:00–0:05'],
  ['02', 'The hook', '0:05–0:14'],
  ['03', 'Core flow', '0:14–0:38'],
  ['04', 'The result', '0:38–0:52'],
  ['05', 'Sign-off', '0:52–1:00'],
]

const PlanMock = () => (
  <div className="hiw-mock hiw-storyboard">
    <p className="hiw-r-label hiw-in">Storyboard</p>
    <ol className="hiw-sb-list hiw-stagger">
      {SCENES.map(([n, name, time]) => (
        <li key={n} className="hiw-in">
          <span className="hiw-sb-thumb">{n}</span>
          <span className="hiw-sb-name">{name}</span>
          <span className="hiw-sb-time">{time}</span>
        </li>
      ))}
    </ol>
  </div>
)

const ShootMock = () => (
  <div className="hiw-mock hiw-shoot">
    <p className="hiw-r-label hiw-in">
      <span className="hiw-rec-dot" /> Shooting · scene 03 / 05
    </p>
    <div className="hiw-strip-frames">
      {SCENES.map(([n], i) => (
        <span
          key={n}
          className={cx('hiw-frame', i < 3 && 'is-shot', i === 2 && 'is-live')}
          style={{ '--i': i } as React.CSSProperties}
        />
      ))}
    </div>
    <div className="hiw-shoot-now hiw-in">
      <span className="hiw-play-sm" aria-hidden="true">
        ▶
      </span>
      narrating · scoring · colour grade
    </div>
  </div>
)

const EditMock = () => (
  <div className="hiw-mock hiw-editor">
    <div className="hiw-ed-frame hiw-in">
      <span className="hiw-ed-v">V2</span>
      <span className="hiw-ed-live">● now live</span>
    </div>
    <div className="hiw-ed-chat hiw-stagger">
      <p className="hiw-ed-msg hiw-in">Trim the intro to two seconds</p>
      <p className="hiw-ed-sys hiw-in">Re-cut scene 01. Nothing else changes.</p>
    </div>
  </div>
)

/* ── right-hand minis ────────────────────────────────────────── */

const MiniLine = ({ children }: { children: React.ReactNode }) => (
  <div className="lb-hiw-mini lb-hiw-mini--line">{children}</div>
)
const MiniVersion = ({ tag, note }: { tag: string; note: string }) => (
  <div className="lb-hiw-mini lb-hiw-mini--ver">
    <span className="lb-hiw-mini-v">{tag}</span>
    <span className="lb-hiw-mini-note">{note}</span>
  </div>
)
const MiniProgress = ({ done, total, note }: { done: number; total: number; note: string }) => (
  <div className="lb-hiw-mini lb-hiw-mini--prog">
    <div className="lb-hiw-prog-head">
      <span>
        {done} / {total}
      </span>
      {note}
    </div>
    <div className="lb-hiw-prog-bar">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? 'is-done' : ''} />
      ))}
    </div>
  </div>
)

const STEPS = [
  {
    n: '01',
    kicker: 'The brief',
    title: 'Prompt',
    body: 'Describe the demo in one sentence and drop the URL. No storyboard, no script to write.',
    chips: ['Plan mode', 'Pick a voice', 'Aspect & length'],
    Mock: PromptMock,
    mini: <MiniLine>one sentence · accepted as the brief</MiniLine>,
  },
  {
    n: '02',
    kicker: 'Understanding',
    title: 'Research',
    body: 'The agent reads your site and brand: real colours, type and tone, plus the flows actually worth showing.',
    chips: ['Reads your site', 'Pulls brand', 'Finds the flows'],
    Mock: ResearchMock,
    mini: <MiniLine>signed in · walked 6 flows · 240 frames captured</MiniLine>,
  },
  {
    n: '03',
    kicker: 'Direction',
    title: 'Plan',
    body: 'It storyboards the cut scene by scene, with pacing, a shot list and the narration beat for each moment.',
    chips: ['Scene by scene', 'Shot list', 'Narration beats'],
    Mock: PlanMock,
    mini: <MiniVersion tag="V1" note="storyboard locked" />,
  },
  {
    n: '04',
    kicker: 'Production',
    title: 'Shoot',
    body: 'It drives the real product, records every scene, then narrates, scores and colour-grades a 1080p cut.',
    chips: ['Real browser', 'Narrated & scored', '40+ languages'],
    Mock: ShootMock,
    mini: <MiniProgress done={4} total={5} note="rendering scenes" />,
  },
  {
    n: '05',
    kicker: 'Iterate',
    title: 'Edit',
    body: 'Every layer stays editable. Swap a voice, trim a scene, restyle a caption. No full re-render, no hallucinated frames.',
    chips: ['Edit any scene', 'Swap the voice', 'No re-render'],
    Mock: EditMock,
    mini: <MiniVersion tag="V2" note="completely editable" />,
  },
]

export const HowItWorks = () => {
  const [active, setActive] = useState(0)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const ctaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 769px)', () => {
      const steps = stepRefs.current.filter(Boolean) as HTMLLIElement[]
      const ctx = gsap.context(() => {
        if (ctaRef.current) {
          gsap.from(ctaRef.current, {
            autoAlpha: 0,
            y: 24,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: ctaRef.current, start: 'top 90%', once: true },
          })
        }
        steps.forEach((el, i) => {
          const smoothstep = (value: number) => value * value * (3 - 2 * value)
          const paintStep = (progress: number) => {
            const enterEnd = 0.3
            const exitStart = 0.7
            let visibility = 1
            let y = 0

            if (progress < enterEnd) {
              const eased = smoothstep(progress / enterEnd)
              visibility = eased
              y = 34 * (1 - eased)
            } else if (progress > exitStart) {
              const eased = smoothstep((progress - exitStart) / (1 - exitStart))
              visibility = 1 - eased
              y = -34 * eased
            }

            gsap.set(el, { autoAlpha: 0.1 + visibility * 0.9, y })
          }

          gsap.set(el, { autoAlpha: 0.1, y: 34 })
          ScrollTrigger.create({
            trigger: el,
            start: 'top 88%',
            end: 'bottom 12%',
            onUpdate: self => paintStep(self.progress),
            onRefresh: self => paintStep(self.progress),
            onLeave: () => paintStep(1),
            onLeaveBack: () => paintStep(0),
          })

          ScrollTrigger.create({
            trigger: el,
            start: 'top 58%',
            end: 'bottom 42%',
            onToggle: self => {
              if (self.isActive) setActive(i)
            },
          })
        })
      })
      return () => ctx.revert()
    })
    return () => mm.revert()
  }, [])

  return (
    <section className="lb-band lb-hiw" aria-labelledby="hiw-heading">
      <div className="lb-wrap lb-hiw-head lb-reveal">
        <p className="lb-chy">How it works</p>
        <h2 id="hiw-heading" className="lb-h2">
          One agent. Idea to finished cut.
        </h2>
        <p className="lb-sub lb-muted">
          Research, planning, shooting, voiceover, scoring and edit. One pass, one place.
        </p>
      </div>

      <div className="lb-wrap lb-hiw-grid">
        <div className="lb-hiw-stage" aria-hidden="true">
          <div className="lb-hiw-visual is-active">
            <AgentPipelineFrame active={active} />
          </div>
        </div>

        <ol className="lb-hiw-steps">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              ref={el => {
                stepRefs.current[i] = el
              }}
              className={cx('lb-hiw-step', i === active && 'is-active')}
            >
              <div className={cx('lb-hiw-inline', i === active && 'is-active')} aria-hidden="true">
                <s.Mock />
              </div>
              <p className="lb-hiw-num">
                <span>{s.n}</span>
                {s.kicker}
              </p>
              <h3>{s.title}</h3>
              <p className="lb-hiw-body">{s.body}</p>
              <div className="lb-hiw-chips">
                {s.chips.map(c => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              {s.mini}

              {i === STEPS.length - 1 && (
                <div className="lb-hiw-cta" ref={ctaRef}>
                  <p className="lb-hiw-cta-line">That is the whole loop.</p>
                  <div className="lb-hiw-cta-actions">
                    <a
                      className="lb-cta lb-cta--ghost"
                      href="mailto:support@trypitch.co?subject=Pitch%20demo"
                    >
                      Book a demo
                    </a>
                    <a className="lb-cta" href="/sign-up">
                      Get started
                    </a>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
