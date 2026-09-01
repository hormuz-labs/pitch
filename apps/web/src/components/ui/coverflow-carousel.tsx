'use client'

import { ChevronLeft, ChevronRight, Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Cross-browser fullscreen — falls back to webkitEnterFullscreen for iOS Safari. */
const enterFullscreen = (video: HTMLVideoElement) => {
  if (video.requestFullscreen) {
    video.requestFullscreen().catch(() => {})
  } else if (
    (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen
  ) {
    ;(video as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen()
  }
}

export interface CoverflowSlide {
  src: string
  alt: string
  /** Poster frame shown before the clip loads. */
  poster?: string
  title?: string
  subtitle?: string
  meta?: { label: string; value: string }[]
}

export interface CoverflowCarouselProps {
  slides: CoverflowSlide[]
  /** Degrees the first neighbour tilts. */
  rotate?: number
  /** How far the first neighbour recedes, as a fraction of card width. */
  depth?: number
  /** Viewer distance as a multiple of card width — smaller is a wider lens. */
  perspective?: number
  /** Exponent on distance. Below 1 the rake eases off as cards travel out. */
  falloff?: number
  /** Opacity lost per step from the centre. */
  fade?: number
  /** Extra scale on the centre card, easing off with distance. */
  focusScale?: number
  /** Any CSS length. Everything else is derived from it, so the rake scales. */
  cardWidth?: string
  /** Space between cards, as a fraction of card width. */
  gap?: number
  loop?: boolean
  showCaption?: boolean
  showPagination?: boolean
  showNavigation?: boolean
  /** Names the carousel for assistive tech. */
  label?: string
  className?: string
  cardClassName?: string
  /** 0 collapses every card onto the centre; 1 is the full coverflow. Drive it
      from a scroll timeline for a "single video opens into the reel" reveal. */
  spreadRef?: React.MutableRefObject<number>
  /** Filled with the carousel's repaint fn so an external timeline can nudge it. */
  paintRef?: React.MutableRefObject<(() => void) | null>
}

export function CoverflowCarousel({
  slides,
  rotate = 44,
  depth = 0.6,
  perspective = 3,
  falloff = 0.56,
  fade = 0.1,
  focusScale = 0.15,
  cardWidth = 'clamp(240px, 34vw, 440px)',
  gap = 0.05,
  loop = true,
  showCaption = false,
  showPagination = false,
  showNavigation = false,
  label = 'Cover carousel',
  className,
  cardClassName,
  spreadRef,
  paintRef,
}: CoverflowCarouselProps) {
  const count = slides.length

  const frameRef = React.useRef<HTMLDivElement>(null)
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([])
  /** Fractional card index at the centre. The single source of truth. */
  const posRef = React.useRef(0)
  /** Where the current settle is headed. Stepping off `pos` instead would
      swallow a keypress that lands mid-flight, before the round-off moves. */
  const targetRef = React.useRef(0)
  const widthRef = React.useRef(0)
  const rafRef = React.useRef<number | null>(null)
  const dragRef = React.useRef<{
    id: number
    x: number
    pos: number
    v: number
    t: number
  } | null>(null)

  const [selected, setSelected] = React.useState(0)
  const [isInViewport, setIsInViewport] = React.useState(false)
  /** Browsers only allow audio after a user gesture — flipped on first interaction. */
  const [soundOn, setSoundOn] = React.useState(false)
  const videoRefs = React.useRef<(HTMLVideoElement | null)[]>([])
  /** Playback state of the centre video, for the play/pause + time display. */
  const [playback, setPlayback] = React.useState({
    paused: false,
    time: 0,
    duration: 0,
    muted: true,
  })

  /** Nearest whole card, folded back into 0..count-1. */
  const indexAt = React.useCallback(
    (pos: number) => ((Math.round(pos) % count) + count) % count,
    [count],
  )

  // Paint straight to the DOM. Sixty state updates a second would re-render
  // every card for numbers React never needs to see.
  const paint = React.useCallback(() => {
    const width = widthRef.current
    if (!width) return
    const pitch = width * (1 + gap)
    const pos = posRef.current

    cardRefs.current.forEach((card, index) => {
      if (!card) return

      // Fold the distance into the shorter way round the ring. This is the
      // whole looping mechanism — no cloned nodes, no shuffling the DOM.
      let offset = index - pos
      if (loop) {
        offset = ((offset % count) + count) % count
        if (offset > count / 2) offset -= count
      }

      const distance = Math.abs(offset)
      // Both the tilt and the recession ease off as cards travel out —
      // doubling the distance adds only about half again as much of each.
      // A linear ramp folds the second card shut; this keeps it readable.
      const ramp = distance ** falloff
      // Capped short of edge-on so a far card never turns its back.
      const tilt = Math.min(rotate * ramp, 82) * Math.sign(offset)

      // 0 stacks every card on the centre; 1 is the full rake.
      const rawSpread = spreadRef ? Math.max(0, Math.min(1, spreadRef.current)) : 1
      // Smoothstep gives the reel zero velocity at both the stacked and fully
      // open states. That removes the visual snap when scrolling either way.
      const s = rawSpread * rawSpread * (3 - 2 * rawSpread)

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch * s}px)) ` +
        `translateZ(${-depth * width * ramp * s}px) rotateY(${-tilt * s}deg) ` +
        // The centre card looms a little larger; the boost eases off smoothly
        // as a card travels out, so settle and drag stay fluid.
        `scale(${1 + Math.max(0, 1 - distance) * focusScale})`

      // A card is teleported across the ring at exactly half a turn out, so it
      // has to be gone by then or the jump is visible.
      const edge = loop ? Math.min(1, Math.max(0, count / 2 - distance)) : 1
      const baseOpacity = Math.max(0, 1 - fade * distance) * edge
      // While collapsed, only the centre card shows; neighbours fade in with s.
      card.style.opacity = String(distance < 0.5 ? baseOpacity : baseOpacity * s)
      card.style.zIndex = String(100 - Math.round(distance))
    })
  }, [count, depth, fade, falloff, focusScale, gap, loop, rotate, spreadRef])

  React.useEffect(() => {
    if (!paintRef) return
    paintRef.current = paint
    return () => {
      paintRef.current = null
    }
  }, [paint, paintRef])

  const settle = React.useCallback(
    (target: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      targetRef.current = target
      setSelected(indexAt(target))

      const step = () => {
        const remaining = target - posRef.current
        if (Math.abs(remaining) < 0.0004) {
          posRef.current = target
          paint()
          rafRef.current = null
          return
        }
        // ponytail: exponential ease-out, not a spring. Swap in a spring only
        // if the settle needs overshoot.
        posRef.current += remaining * 0.16
        paint()
        rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [indexAt, paint],
  )

  const clamp = React.useCallback(
    (pos: number) => (loop ? pos : Math.max(0, Math.min(count - 1, pos))),
    [count, loop],
  )

  const goTo = React.useCallback(
    (index: number) => {
      // Take the shorter way round rather than unwinding the whole ring.
      const target = loop ? index + Math.round((targetRef.current - index) / count) * count : index
      settle(clamp(target))
    },
    [clamp, count, loop, settle],
  )

  const nudge = React.useCallback(
    (by: number) => settle(clamp(Math.round(targetRef.current) + by)),
    [clamp, settle],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    targetRef.current = posRef.current
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      pos: posRef.current,
      v: 0,
      t: performance.now(),
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return

    const pitch = widthRef.current * (1 + gap)
    if (!pitch) return

    const now = performance.now()
    const previous = posRef.current
    posRef.current = clamp(drag.pos - (event.clientX - drag.x) / pitch)
    // Cards per second, for the throw.
    drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000
    drag.t = now

    const index = indexAt(posRef.current)
    if (index !== selected) setSelected(index)
    paint()
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    // Let a flick carry, but never more than two cards.
    const carried = Math.max(-2, Math.min(2, drag.v * 0.18))
    settle(clamp(Math.round(posRef.current + carried)))
  }

  // Card width drives pitch, depth and perspective, so it is the only thing
  // worth measuring — and only when the box actually changes.
  useIsoLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = () => {
      const card = cardRefs.current[0]
      if (!card) return
      widthRef.current = card.offsetWidth
      paint()
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [paint])

  React.useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new IntersectionObserver(([entry]) => setIsInViewport(entry.isIntersecting), {
      rootMargin: '160px 0px',
      threshold: 0.01,
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  React.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  // Only the centre card talks. `muted` is set imperatively because React's
  // `muted` prop maps to the attribute (defaultMuted) and won't flip the
  // property on an already-mounted video element. Never touch play state
  // here — the user may have paused on purpose.
  React.useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return
      video.muted = !soundOn || index !== selected
    })
  }, [selected, soundOn])

  // Only the centre video decodes and plays. Autoplaying every offscreen clip
  // competes with the transform animation for main-thread and GPU time.
  React.useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return
      if (index === selected && isInViewport) {
        video.currentTime = 0
        if (video.paused) video.play().catch(() => {})
      } else if (!video.paused) {
        video.pause()
      }
    })
  }, [selected, isInViewport])

  // Track the centre video for the play/pause + time display.
  React.useEffect(() => {
    const video = videoRefs.current[selected]
    if (!video) return
    const update = () =>
      setPlayback({
        paused: video.paused,
        time: video.currentTime,
        duration: video.duration || 0,
        muted: video.muted,
      })
    update()
    video.addEventListener('timeupdate', update)
    video.addEventListener('play', update)
    video.addEventListener('pause', update)
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('volumechange', update)
    return () => {
      video.removeEventListener('timeupdate', update)
      video.removeEventListener('play', update)
      video.removeEventListener('pause', update)
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('volumechange', update)
    }
  }, [selected])

  // Native controls only exist while the video is fullscreen.
  // • Standard browsers: fullscreenchange / webkitfullscreenchange on document
  // • iOS Safari: webkitbeginfullscreen / webkitendfullscreen on the video element itself
  React.useEffect(() => {
    const onDocFullscreen = () => {
      const fullEl =
        document.fullscreenElement ??
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
      videoRefs.current.forEach(video => {
        if (video) video.controls = fullEl === video
      })
    }
    document.addEventListener('fullscreenchange', onDocFullscreen)
    document.addEventListener('webkitfullscreenchange', onDocFullscreen)

    // Per-video iOS listeners — must be attached after mount so refs are filled.
    const perVideoCleanups = videoRefs.current.map(video => {
      if (!video) return () => {}
      const onBegin = () => {
        video.controls = true
        video.muted = false // unmute so sound works in iOS fullscreen
      }
      const onEnd = () => {
        video.controls = false
      }
      video.addEventListener('webkitbeginfullscreen', onBegin)
      video.addEventListener('webkitendfullscreen', onEnd)
      return () => {
        video.removeEventListener('webkitbeginfullscreen', onBegin)
        video.removeEventListener('webkitendfullscreen', onEnd)
      }
    })

    return () => {
      document.removeEventListener('fullscreenchange', onDocFullscreen)
      document.removeEventListener('webkitfullscreenchange', onDocFullscreen)
      perVideoCleanups.forEach(fn => fn())
    }
  }, [])

  const active = slides[selected]

  return (
    <div
      className={cn('w-full', className)}
      style={{ ['--cf-card' as string]: cardWidth }}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerDown={() => setSoundOn(true)}
    >
      <div className="relative">
        <div
          ref={frameRef}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={event => {
            setSoundOn(true)
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              nudge(-1)
            } else if (event.key === 'ArrowRight') {
              event.preventDefault()
              nudge(1)
            }
          }}
          // Vertical padding keeps the drop shadows clear of the overflow clip.
          className="cursor-grab overflow-hidden py-10 outline-none ring-ring focus-visible:ring-2 active:cursor-grabbing"
          style={{
            perspective: `calc(var(--cf-card) * ${perspective})`,
            // Horizontal drag is ours; the page keeps vertical scrolling.
            touchAction: 'pan-y',
          }}
        >
          <div
            className="relative select-none"
            style={{
              height: 'calc(var(--cf-card) * 9 / 16)',
              transformStyle: 'preserve-3d',
            }}
          >
            {slides.map((slide, index) => (
              <div
                key={index}
                ref={node => {
                  cardRefs.current[index] = node
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}`}
                className={cn(
                  'group absolute left-1/2 top-0 aspect-video overflow-hidden rounded-2xl bg-muted shadow-xl',
                  cardClassName,
                )}
                style={{
                  width: 'var(--cf-card)',
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                  contain: 'layout paint',
                }}
              >
                <video
                  ref={node => {
                    videoRefs.current[index] = node
                  }}
                  src={slide.poster ? slide.src : `${slide.src}#t=0.6`}
                  poster={slide.poster}
                  aria-label={slide.alt}
                  muted
                  loop
                  playsInline
                  preload={index === selected ? 'metadata' : 'none'}
                  disablePictureInPicture
                  className="h-full w-full select-none bg-neutral-900 object-cover pointer-events-none"
                />
                {index === selected && (
                  <>
                    {/* Play/pause, seek, elapsed/total and mute for the centre video. */}
                    <div
                      // Keep the frame from treating presses here as a drag.
                      onPointerDown={event => event.stopPropagation()}
                      className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-2 rounded-full bg-black/60 py-1.5 px-2.5 text-white backdrop-blur transition opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <button
                        type="button"
                        aria-label={playback.paused ? 'Play video' : 'Pause video'}
                        onClick={event => {
                          event.stopPropagation()
                          setSoundOn(true)
                          const video = videoRefs.current[index]
                          if (!video) return
                          if (video.paused) video.play().catch(() => {})
                          else video.pause()
                        }}
                        className="flex size-5 items-center justify-center transition hover:scale-110"
                      >
                        {playback.paused ? (
                          <Play className="size-3.5 fill-current" />
                        ) : (
                          <Pause className="size-3.5 fill-current" />
                        )}
                      </button>
                      <input
                        type="range"
                        aria-label="Seek through video"
                        min={0}
                        max={playback.duration || 0}
                        step={0.1}
                        value={playback.time}
                        onChange={event => {
                          const video = videoRefs.current[index]
                          if (video) video.currentTime = Number(event.target.value)
                        }}
                        className="h-1 w-16 cursor-pointer accent-white sm:w-24"
                      />
                      <span className="text-[11px] font-medium tabular-nums">
                        {formatTime(playback.time)} / {formatTime(playback.duration)}
                      </span>
                      <button
                        type="button"
                        aria-label={playback.muted ? 'Unmute video' : 'Mute video'}
                        onClick={event => {
                          event.stopPropagation()
                          setSoundOn(true)
                          const video = videoRefs.current[index]
                          if (video) video.muted = !video.muted
                        }}
                        className="flex size-5 items-center justify-center transition hover:scale-110"
                      >
                        {playback.muted ? (
                          <VolumeX className="size-3.5" />
                        ) : (
                          <Volume2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Play ${slide.title ?? 'video'} fullscreen`}
                      // Keep the frame from treating this press as a drag.
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => {
                        event.stopPropagation()
                        setSoundOn(true)
                        const video = videoRefs.current[index]
                        if (video) enterFullscreen(video)
                      }}
                      className="absolute top-2.5 right-2.5 md:top-auto md:bottom-2.5 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Maximize className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {showNavigation && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => nudge(-1)}
              className="absolute left-3 top-1/2 z-[200] -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground backdrop-blur transition hover:bg-background"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => nudge(1)}
              className="absolute right-3 top-1/2 z-[200] -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground backdrop-blur transition hover:bg-background"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {showCaption && active?.title && (
        <div
          key={selected}
          className="mt-2 flex flex-col items-center px-6 duration-300 animate-in fade-in"
        >
          <p className="text-[15px] font-semibold tracking-tight text-foreground">{active.title}</p>
          {active.subtitle &&
            (() => {
              const parts = active.subtitle.split(' using ')
              if (parts.length === 2) {
                return (
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {parts[0]} using{' '}
                    <span className="font-semibold text-foreground">{parts[1]}</span>
                  </p>
                )
              }
              return <p className="mt-1 text-[13px] text-muted-foreground">{active.subtitle}</p>
            })()}
          {active.meta && active.meta.length > 0 && (
            <dl className="mt-8 w-full max-w-[340px] text-[12px]">
              {active.meta.map(row => (
                <div key={row.label} className="flex justify-between gap-6 py-[5px]">
                  <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 break-words text-right font-medium text-foreground">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {showPagination && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === selected}
              onClick={() => goTo(index)}
              className={cn(
                'size-2 rounded-full bg-foreground transition-opacity',
                index === selected ? 'opacity-100' : 'opacity-30',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
