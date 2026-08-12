'use client'

import { useEffect, useRef, useState } from 'react'
import agentcardVideo from '../../assets/carousel/agentcard.mp4'
import demoVideo from '../../assets/demo.mp4'
import graphifyVideo from '../../assets/carousel/graphify.mp4'
import gtmcofounderVideo from '../../assets/carousel/gtmcofounder.mp4'
import sioVideo from '../../assets/carousel/sio.mp4'
import supermemoryVideo from '../../assets/carousel/supermemory.mp4'
import { CoverflowCarousel, type CoverflowSlide } from '../ui/coverflow-carousel'

const SLIDES: CoverflowSlide[] = [
  {
    src: demoVideo,
    alt: 'Shadcn UI walkthrough — made with Pitch Demo Video feature',
    title: 'Shadcn',
    subtitle: 'Made with Pitch using Demo Video Feature',
    meta: [
      { label: 'Website', value: 'https://ui.shadcn.com/' },
      { label: 'Prompt', value: 'Give a walkthrough of the https://ui.shadcn.com/ and tell us how to add a component' },
    ],
  },
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

export const VideoCarousel = () => (
  <div className="w-full overflow-hidden py-6">
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
    <CoverflowCarousel
      slides={SLIDES}
      showCaption
      showPagination
      label="Demo videos made with Pitch"
    />
  </div>
)
