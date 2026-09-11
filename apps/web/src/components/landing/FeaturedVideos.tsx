import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { carouselAsset } from './carouselAssets'
import { filmPoster } from './filmPoster'

interface FeaturedSlide {
  src: string
  title: string
}

const FEATURED_SLIDES: FeaturedSlide[] = [
  { src: carouselAsset('graphify.mp4'), title: 'Graphify' },
  { src: carouselAsset('gtmcofounder.mp4'), title: 'GTM Cofounder' },
  { src: carouselAsset('supermemory.mp4'), title: 'Supermemory' },
  { src: carouselAsset('unsloth-launch.mp4'), title: 'Unsloth AI' },
  { src: carouselAsset('demo.mp4'), title: 'Shadcn' },
  { src: carouselAsset('sio.mp4'), title: 'Students Islamic Organization' },
  { src: carouselAsset('agentcard.mp4'), title: 'AgentCard' },
  { src: carouselAsset('replit.mp4'), title: 'Replit' },
]

const FILTERS = ['All', 'Explainers', 'Launch & promo', 'Product demos', 'Typography']

const playPreview = (event: { currentTarget: HTMLElement }) => {
  event.currentTarget.querySelector('video')?.play()
}

const pausePreview = (event: { currentTarget: HTMLElement }) => {
  event.currentTarget.querySelector('video')?.pause()
}

const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export function FeaturedVideos() {
  let section: HTMLElement | undefined
  const [progress, setProgress] = createSignal(0)

  onMount(() => {
    let frame = 0
    const scrollContainer = section?.closest('.app-shell-main')
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const node = section
        if (!node) return
        const rect = node.getBoundingClientRect()
        const viewport = window.innerHeight
        const distance = Math.max(1, node.offsetHeight - viewport)
        setProgress(Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + distance))))
      })
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    scrollContainer?.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    onCleanup(() => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure)
      scrollContainer?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    })
  })

  // No exit pass: the page ends with the wall fully open, so the last frame
  // of the scroll is the featured grid itself rather than it dissolving away.
  const enter = () => smoothstep(0.04, 0.3, progress())
  const gridTravel = () => smoothstep(0.27, 0.92, progress())

  return (
    <section id="featured-videos" ref={section} class="new-featured" aria-label="Featured videos">
      <div class="new-featured__sticky">
        <div
          class="new-featured__panel"
          style={{
            '--featured-width': `${70 + enter() * 30}%`,
            '--featured-height': `${86 + enter() * 14}vh`,
            '--featured-radius': `${18 * (1 - enter())}px`,
          }}
        >
          <div class="new-featured__content" style={{ '--featured-grid-y': `${-52 * gridTravel()}vh` }}>
            <div class="new-featured__head">
              <h2>Featured videos</h2>
              <div>
                <For each={FILTERS}>
                  {(filter, index) => (
                    <span classList={{ 'is-active': index() === 0 }}>{filter}</span>
                  )}
                </For>
              </div>
            </div>
            <div class="new-featured__grid">
              <For each={FEATURED_SLIDES}>
                {slide => (
                  <button
                    type="button"
                    class="new-featured__video"
                    onMouseEnter={playPreview}
                    onMouseLeave={pausePreview}
                    onFocus={playPreview}
                    onBlur={pausePreview}
                    onClick={event => {
                      const video = event.currentTarget.querySelector('video')
                      void video?.requestFullscreen?.()
                      void video?.play()
                    }}
                  >
                    <video
                      src={`${slide.src}#t=0.5`}
                      poster={filmPoster(slide.title)}
                      muted
                      loop
                      playsinline
                      preload="metadata"
                    />
                    <span>{slide.title}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
