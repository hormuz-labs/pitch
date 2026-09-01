'use client'

import { useEffect, useRef, useState } from 'react'
import { CoverflowCarousel, type CoverflowSlide } from '../ui/coverflow-carousel'

/** Public MinIO bucket holding the carousel demo videos. Override per-env with VITE_CAROUSEL_ASSET_URL. */
const ASSET_BASE = (
  import.meta.env.VITE_CAROUSEL_ASSET_URL || 'https://s3.trypitch.co/carousel/carousel'
).replace(/\/$/, '')

const video = (name: string) => `${ASSET_BASE}/${name}`

const agentcardVideo = video('agentcard.mp4')
const demoVideo = video('demo.mp4')
const graphifyVideo = video('graphify.mp4')
const gtmcofounderVideo = video('gtmcofounder.mp4')
const replitVideo = video('replit.mp4')
const sioVideo = video('sio.mp4')
const supermemoryVideo = video('supermemory.mp4')
const unslothVideo = video('unsloth-launch.mp4')

export const SLIDES: CoverflowSlide[] = [
  {
    src: graphifyVideo,
    alt: 'Pitch-generated demo video for Graphify',
    title: 'Graphify',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://graphify.com/' },
      { label: 'Prompt', value: 'Make 70 second launch video on https://graphify.com/' },
    ],
  },
  {
    src: gtmcofounderVideo,
    alt: 'Pitch-generated demo video for GTM Cofounder',
    title: 'GTM Cofounder',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://gtmcofounder.com/' },
      { label: 'Prompt', value: 'Make 40 second launch video of https://gtmcofounder.com/' },
    ],
  },
  {
    src: supermemoryVideo,
    alt: 'Pitch-generated demo video for Supermemory',
    title: 'Supermemory',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://supermemory.ai/' },
      { label: 'Prompt', value: 'Make 35 second launch video of https://supermemory.ai/' },
    ],
  },

  {
    src: unslothVideo,
    alt: 'Pitch-generated launch video for Unsloth AI',
    title: 'Unsloth AI',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://unsloth.ai/' },
      { label: 'Prompt', value: 'Make 70 seconds launch video on https://unsloth.ai/' },
    ],
  },

  {
    src: demoVideo,
    alt: 'Shadcn UI walkthrough — made with Pitch Demo Video feature',
    title: 'Shadcn',
    subtitle: 'Made with Pitch using Demo Video Feature',
    meta: [
      { label: 'Website', value: 'https://ui.shadcn.com/' },
      {
        label: 'Prompt',
        value:
          'Give a walkthrough of the https://ui.shadcn.com/ and tell us how to add a component',
      },
    ],
  },
  {
    src: sioVideo,
    alt: 'Pitch-generated demo video for Sio',
    title: 'Students Islamic Organization',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://siodelhi.org/' },
      { label: 'Prompt', value: 'Make 30 second launch video of https://siodelhi.org/' },
    ],
  },
  {
    src: agentcardVideo,
    alt: 'Pitch-generated demo video for AgentCard',
    title: 'AgentCard',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://www.agentcard.sh/' },
      { label: 'Prompt', value: 'Make 45 second launch video of https://www.agentcard.sh/' },
    ],
  },

  {
    src: replitVideo,
    alt: 'Pitch-generated launch video for Replit',
    title: 'Replit',
    subtitle: 'Made with Pitch using Launch Video Feature',
    meta: [
      { label: 'Website', value: 'https://replit.com/' },
      { label: 'Prompt', value: 'Make 70 second launch video of https://replit.com' },
    ],
  },
]

/** "editor" with a strike that draws itself once the heading scrolls into view. */
const StruckEditor = () => {
  const ref = useRef<HTMLSpanElement>(null)
  const [struck, setStruck] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStruck(true)
          observer.disconnect()
        }
      },
      { threshold: 0.8 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <span ref={ref} className={`struck-editor${struck ? ' struck' : ''}`}>
      editor
    </span>
  )
}

export const VideoCarousel = ({ showHeader = true }: { showHeader?: boolean }) => (
  <div className="w-full overflow-hidden py-6">
    {showHeader && (
      <div className="flex flex-col items-center gap-4 px-6 pb-8 text-center">
        <h2
          className="landing-hiw-heading !text-center"
          style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}
        >
          One prompt. Our <StruckEditor /> agent did the rest.
        </h2>
        <p className="landing-hiw-tagline !text-center max-w-xl">
          Made with Pitch&apos;s Launch Video feature — in under 10 minutes.
        </p>
      </div>
    )}
    <CoverflowCarousel
      slides={SLIDES}
      showCaption
      showPagination
      label="Demo videos made with Pitch"
    />
  </div>
)
