import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

export function ContainerTextFlip({
  words,
  interval = 3000,
  className = '',
}: {
  words: string[]
  interval?: number
  className?: string
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [maxWidth, setMaxWidth] = useState(0)
  const measureRef = useRef<HTMLDivElement>(null)

  // Measure the widest word for stable container width
  useEffect(() => {
    if (!measureRef.current) return
    const spans = measureRef.current.querySelectorAll('span')
    let max = 0
    spans.forEach(span => {
      max = Math.max(max, span.offsetWidth)
    })
    setMaxWidth(max + 8)
  }, [])

  const next = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % words.length)
  }, [words.length])

  useEffect(() => {
    const timer = setInterval(next, interval)
    return () => clearInterval(timer)
  }, [next, interval])

  return (
    <>
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        aria-hidden
        className="absolute opacity-0 pointer-events-none"
        style={{ whiteSpace: 'nowrap' }}
      >
        {words.map(word => (
          <span key={word} className={className} style={{ display: 'inline-block' }}>
            {word}
          </span>
        ))}
      </div>

      {/* Visible animated container */}
      <span
        className="relative inline-flex items-center justify-center overflow-hidden rounded-md bg-gray-100 border border-gray-200 px-3 mx-0.5"
        style={{
          width: maxWidth > 0 ? maxWidth : 'auto',
          height: '1.25em',
          verticalAlign: 'middle',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={words[currentIndex]}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={`absolute whitespace-nowrap text-gray-900 font-bold ${className}`}
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  )
}
