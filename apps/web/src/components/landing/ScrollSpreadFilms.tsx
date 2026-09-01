/**
 * ScrollSpreadFilms — a single film that opens into the coverflow reel as you
 * scroll. The section pins; a scrubbed ScrollTrigger drives the carousel's
 * `spread` from 0 (every card stacked on the centre) to 1 (full coverflow),
 * while the header recedes. Below 769px / reduced-motion the carousel just
 * renders open.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useMemo, useRef } from 'react'
import { CoverflowCarousel } from '../ui/coverflow-carousel'
import { filmPoster } from './filmPoster'
import { SLIDES } from './VideoCarousel'

gsap.registerPlugin(ScrollTrigger)

export const ScrollSpreadFilms = () => {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const spreadRef = useRef(0)
  const paintRef = useRef<(() => void) | null>(null)

  const slides = useMemo(
    () => SLIDES.map(s => ({ ...s, poster: s.poster ?? filmPoster(s.title ?? 'Pitch') })),
    [],
  )

  useEffect(() => {
    const setSpread = (v: number) => {
      if (Math.abs(spreadRef.current - v) < 0.001) return
      spreadRef.current = v
      paintRef.current?.()
    }

    const mm = gsap.matchMedia()

    mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
      setSpread(0)

      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top top',
        end: () => `+=${Math.round(window.innerHeight * 1.35)}`,
        pin: true,
        // Lenis already filters wheel input; keep only a tiny amount of local
        // interpolation so the pinned reveal stays attached to the page.
        scrub: 0.18,
        onRefresh: () => paintRef.current?.(),
        onUpdate: self => {
          const p = self.progress
          // reel opens over 12%–100% of the scroll
          setSpread(gsap.utils.clamp(0, 1, (p - 0.12) / 0.88))
          const h = headerRef.current
          if (h) {
            // Start clearing the copy just before the reel separates, then get
            // it fully out of the frame during the opening movement. Deriving
            // both values from progress keeps the transition reversible.
            const headerFade = gsap.utils.clamp(0, 1, (p - 0.025) / 0.3)
            h.style.opacity = String(1 - headerFade)
            h.style.transform = `translateY(${(-headerFade * 28).toFixed(1)}px)`
          }
        },
      })

      return () => {
        st.kill()
        setSpread(1)
        if (headerRef.current) {
          headerRef.current.style.opacity = ''
          headerRef.current.style.transform = ''
        }
      }
    })

    mm.add('(max-width: 768px), (prefers-reduced-motion: reduce)', () => {
      setSpread(1)
    })

    return () => mm.revert()
  }, [])

  return (
    <section className="lb-band lb-spread" ref={sectionRef} aria-labelledby="films-heading">
      <div className="lb-spread-inner">
        <div className="lb-spread-header lb-wrap" ref={headerRef}>
          <p className="lb-chy">URL &rarr; film</p>
          <h2 id="films-heading" className="lb-h2">
            A sentence in. <i>A film out.</i>
          </h2>
          <p className="lb-sub lb-muted">
            One URL and a line of direction. Scroll to open the reel &mdash; every clip still
            carries the brief that made it.
          </p>
        </div>

        <div className="lb-spread-carousel">
          <CoverflowCarousel
            slides={slides}
            showCaption
            showPagination
            showNavigation
            cardWidth="clamp(260px, 40vw, 520px)"
            label="Films made with Pitch"
            spreadRef={spreadRef}
            paintRef={paintRef}
          />
        </div>
      </div>
    </section>
  )
}
