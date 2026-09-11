import { MonitorPlay, X } from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'
import { Dialog } from '../../solid/account/primitives'
import { carouselAsset } from './carouselAssets'
import { filmPoster } from './filmPoster'

interface FeaturedSlide {
  src: string
  title: string
  category: string
}

const FEATURED_SLIDES: FeaturedSlide[] = [
  { src: carouselAsset('graphify.mp4'), title: 'Graphify', category: 'Explainers' },
  { src: carouselAsset('gtmcofounder.mp4'), title: 'GTM Cofounder', category: 'Launch & promo' },
  { src: carouselAsset('supermemory.mp4'), title: 'Supermemory', category: 'Launch & promo' },
  { src: carouselAsset('unsloth-launch.mp4'), title: 'Unsloth AI', category: 'Launch & promo' },
  { src: carouselAsset('demo.mp4'), title: 'Shadcn', category: 'Product demos' },
  { src: carouselAsset('sio.mp4'), title: 'Students Islamic Organization', category: 'Explainers' },
  { src: carouselAsset('agentcard.mp4'), title: 'AgentCard', category: 'Launch & promo' },
  { src: carouselAsset('replit.mp4'), title: 'Replit', category: 'Product demos' },
]

const playPreview = (event: { currentTarget: HTMLElement }) => {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    void event.currentTarget
      .querySelector('video')
      ?.play()
      .catch(() => {})
}

const pausePreview = (event: { currentTarget: HTMLElement }) => {
  event.currentTarget.querySelector('video')?.pause()
}

export function FeaturedVideos() {
  const [selected, setSelected] = createSignal<FeaturedSlide | null>(null)
  const card = (slide: FeaturedSlide) => (
    <button
      type="button"
      class="new-featured__video"
      onMouseEnter={playPreview}
      onMouseLeave={pausePreview}
      onFocus={playPreview}
      onBlur={pausePreview}
      onClick={event => {
        pausePreview(event)
        setSelected(slide)
      }}
    >
      <div class="new-featured__image">
        <video
          src={`${slide.src}#t=${slide.title === 'Unsloth AI' ? 20 : 8}`}
          poster={filmPoster(slide.title)}
          muted
          loop
          playsinline
          preload="metadata"
        />
      </div>
      <span>{slide.title}</span>
    </button>
  )

  return (
    <section id="featured-videos" class="new-featured" aria-label="Featured videos">
      <div class="new-featured__content">
        <h2 class="sr-only">Featured videos</h2>
        <div class="new-featured__grid">
          <For each={FEATURED_SLIDES.filter(slide => slide.category !== 'Product demos')}>
            {card}
          </For>
        </div>
        <h2 class="new-featured__category">
          <MonitorPlay size={16} />
          Product demos
        </h2>
        <div class="new-featured__grid">
          <For each={FEATURED_SLIDES.filter(slide => slide.category === 'Product demos')}>
            {card}
          </For>
        </div>
      </div>
      <Show when={selected()}>
        {slide => (
          <Dialog
            open
            title={slide().title}
            onClose={() => setSelected(null)}
            class="featured-player"
          >
            <header>
              <h2>{slide().title}</h2>
              <button aria-label="Close video" onClick={() => setSelected(null)}>
                <X size={20} />
              </button>
            </header>
            <video src={slide().src} controls autoplay playsinline />
          </Dialog>
        )}
      </Show>
    </section>
  )
}
