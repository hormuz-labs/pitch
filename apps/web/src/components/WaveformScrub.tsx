import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'framer-motion'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { TbPlayerPauseFilled, TbPlayerPlayFilled, TbRotateClockwise2 } from 'react-icons/tb'

interface WaveformScrubProps {
  duration?: number
  fileName?: string
  waveformHeights?: number[]
  onConfirm?: () => void
}

const DEFAULT_WAVEFORM = [
  4, 7, 9, 6, 11, 14, 12, 8, 5, 10, 15, 13, 11, 9, 6, 10, 12, 9, 7, 5, 8, 12, 10, 7, 6, 9, 13, 11,
  8, 6, 5, 11, 8, 6, 5, 11, 8, 6, 5, 8, 5, 10, 15, 13, 11, 9,
]

export const WaveformScrub: React.FC<WaveformScrubProps> = ({
  duration = 30,
  fileName = 'Mom.mp3',
  waveformHeights = DEFAULT_WAVEFORM,
  onConfirm,
}) => {
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)

  const [audioDuration, setAudioDuration] = useState(duration)

  const waveformRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const x = useMotionValue(0)

  const isFinished = currentTime >= audioDuration

  useEffect(() => {
    const updateWidth = () => {
      if (waveformRef.current) {
        const newWidth = waveformRef.current.offsetWidth
        setContainerWidth(newWidth)
        x.set((currentTime / audioDuration) * newWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [audioDuration, currentTime, x])

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => {
          console.error('Audio play failed:', e)
          setIsPlaying(false)
        })
      } else {
        audioRef.current.pause()
      }
    }
  }, [isPlaying])

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime
      setCurrentTime(current)
      if (containerWidth > 0 && isPlaying) {
        x.set((current / audioDuration) * containerWidth)
      }
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(audioDuration)
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration
      if (dur && !Number.isNaN(dur) && dur !== Infinity) {
        setAudioDuration(dur)
      }
    }
  }

  useMotionValueEvent(x, 'change', latest => {
    if (!isPlaying && containerWidth > 0) {
      const progress = latest / containerWidth
      const newTime = progress * audioDuration
      setCurrentTime(newTime)
      if (audioRef.current) {
        audioRef.current.currentTime = newTime
      }
    }
  })

  const activeProgress = useTransform(x, [0, containerWidth || 1], ['0%', '100%'])
  const displayTime = Math.max(0, Math.round(audioDuration - currentTime))

  const handleTogglePlay = () => {
    if (isFinished) {
      setCurrentTime(0)
      x.set(0)
      if (audioRef.current) {
        audioRef.current.currentTime = 0
      }
      setIsPlaying(true)
    } else {
      setIsPlaying(!isPlaying)
    }
  }

  const getAudioUrl = (name: string) => {
    try {
      return new URL(`../assets/sounds/${name}`, import.meta.url).href
    } catch (_e) {
      return ''
    }
  }

  return (
    <div className="w-full mt-3">
      <audio
        ref={audioRef}
        src={getAudioUrl(fileName)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
      />
      <div className="flex flex-col items-center justify-center bg-transparent font-sans antialiased">
        <div className="w-full rounded-xl bg-white p-2 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-200/60 transition-colors duration-300">
          <div className="mb-1.5 flex items-center justify-between px-1.5">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.button
                  type="button"
                  key={isFinished ? 'reset' : isPlaying ? 'pause' : 'play'}
                  initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                  transition={{
                    type: 'spring',
                    duration: 0.3,
                    bounce: 0,
                  }}
                  onClick={handleTogglePlay}
                  className="shrink-0 cursor-pointer bg-transparent border-none outline-none text-gray-800 hover:text-gray-600 transition-colors z-20"
                >
                  {isFinished ? (
                    <TbRotateClockwise2 size={14} />
                  ) : isPlaying ? (
                    <TbPlayerPauseFilled size={14} />
                  ) : (
                    <TbPlayerPlayFilled size={14} />
                  )}
                </motion.button>
              </AnimatePresence>
              <span className="truncate text-xs font-semibold tracking-tight text-gray-800">
                {fileName}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-[11px] font-medium text-gray-400 tabular-nums">
                {displayTime}s
              </span>
              <button
                type="button"
                onClick={onConfirm}
                className="px-2.5 py-1 text-[10px] font-bold bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors cursor-pointer shadow-sm active:scale-95"
              >
                Confirm
              </button>
            </div>
          </div>

          <div className="relative flex h-8 items-center justify-center rounded-lg border border-gray-100/50 bg-gray-50/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)] overflow-hidden">
            <motion.div
              style={{
                width: activeProgress,
                backgroundImage: `linear-gradient(-45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)`,
                backgroundSize: '4px 4px',
              }}
              animate={{
                backgroundPositionX: ['0px', '4px'],
              }}
              transition={{
                repeat: Infinity,
                duration: 0.5,
                ease: 'linear',
              }}
              className="pointer-events-none absolute inset-y-0 left-0 opacity-[0.03] transition-opacity"
            />

            <div ref={waveformRef} className="relative mx-1.5 h-4 w-full">
              <div className="absolute inset-0 flex w-full items-center justify-between">
                {waveformHeights.map((h, i) => (
                  <div
                    key={i}
                    className="w-[2px] shrink-0 rounded-full bg-gray-200 transition-colors"
                    style={{ height: h * 0.8 }}
                  />
                ))}
              </div>

              <motion.div
                style={{ width: activeProgress }}
                className="pointer-events-none absolute inset-y-0 left-0 z-10 overflow-hidden"
              >
                <div
                  className="flex h-full items-center justify-between"
                  style={{ width: containerWidth }}
                >
                  {waveformHeights.map((h, i) => (
                    <div
                      key={i}
                      className="w-[2px] shrink-0 rounded-full bg-gray-900 transition-colors shadow-[0_0_2px_rgba(0,0,0,0.2)]"
                      style={{ height: h * 0.8 }}
                    />
                  ))}
                </div>
              </motion.div>

              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: containerWidth }}
                dragElastic={0}
                dragMomentum={false}
                onDragStart={() => setIsPlaying(false)}
                style={{ x, left: -6 }}
                className="absolute top-full z-10 flex h-40 -translate-y-[85%] cursor-grab flex-col items-center active:cursor-grabbing"
              >
                <div
                  className="h-2 w-3 bg-gray-900 shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition-colors"
                  style={{
                    clipPath: `polygon(15% 0%, 85% 0%, 100% 20%, 100% 60%, 60% 100%, 40% 100%, 0% 60%, 0% 20%)`,
                  }}
                />
                <div className="w-px flex-1 rounded-b-full bg-gray-900 shadow-sm transition-colors" />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
