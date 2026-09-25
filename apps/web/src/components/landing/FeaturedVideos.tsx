import { MonitorPlay, X } from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'
import { Dialog } from '../../solid/account/primitives'
import { carouselAsset } from './carouselAssets'
import { carouselPoster } from './carouselPoster'

interface FeaturedSlide {
  file: string
  src: string
  title: string
  category: string
}

const FEATURED_SLIDES: FeaturedSlide[] = [
  {
    file: 'graphify.mp4',
    src: carouselAsset('graphify.mp4'),
    title: 'Graphify',
    category: 'Explainers',
  },
  {
    file: 'gtmcofounder.mp4',
    src: carouselAsset('gtmcofounder.mp4'),
    title: 'GTM Cofounder',
    category: 'Launch & promo',
  },
  {
    file: 'supermemory.mp4',
    src: carouselAsset('supermemory.mp4'),
    title: 'Supermemory',
    category: 'Launch & promo',
  },
  {
    file: 'unsloth-launch.mp4',
    src: carouselAsset('unsloth-launch.mp4'),
    title: 'Unsloth AI',
    category: 'Launch & promo',
  },
  { file: 'demo.mp4', src: carouselAsset('demo.mp4'), title: 'Shadcn', category: 'Product demos' },
  {
    file: 'agentcard.mp4',
    src: carouselAsset('agentcard.mp4'),
    title: 'AgentCard',
    category: 'Launch & promo',
  },
  {
    file: 'replit.mp4',
    src: carouselAsset('replit.mp4'),
    title: 'Replit',
    category: 'Product demos',
  },
  {
    file: 'Thomas.mp4',
    src: carouselAsset('Thomas.mp4'),
    title: 'Thomas',
    category: 'Launch & promo',
  },
  { file: 'leeter.mp4', src: carouselAsset('leeter.mp4'), title: 'Leeter', category: 'Explainers' },
  {
    file: 'productHunt.mp4',
    src: carouselAsset('productHunt.mp4'),
    title: 'Product Hunt',
    category: 'Launch & promo',
  },
  {
    file: 'quippy.mp4',
    src: carouselAsset('quippy.mp4'),
    title: 'Quippy',
    category: 'Launch & promo',
  },
]

export function FeaturedVideos() {
  const [selected, setSelected] = createSignal<FeaturedSlide | null>(null)
  const card = (slide: FeaturedSlide) => (
    <button
      type="button"
      class="new-featured__video"
      aria-label={`Play ${slide.title}`}
      onClick={() => setSelected(slide)}
    >
      <div class="new-featured__image">
        <img src={carouselPoster(slide.file)} alt="" loading="lazy" />
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
