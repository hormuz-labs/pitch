import { AnimatePresence, motion } from 'framer-motion'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

interface PlaceholdersAndVanishInputProps {
  placeholders: string[]
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  value?: string
}

export function PlaceholdersAndVanishInput({
  placeholders,
  onChange,
  value,
}: PlaceholdersAndVanishInputProps) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0)
  const [internalValue, setInternalValue] = useState(value || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync external value
  useEffect(() => {
    if (value !== undefined) setInternalValue(value)
  }, [value])

  // Cycle placeholders
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentPlaceholder(prev => (prev + 1) % placeholders.length)
    }, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [placeholders.length])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInternalValue(e.target.value)
    onChange(e)
  }

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={internalValue}
        onChange={handleChange}
        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all bg-white resize-none h-32 md:h-24"
      />

      {/* Animated placeholder */}
      {!internalValue && (
        <div className="absolute inset-0 px-4 py-3.5 pointer-events-none overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={`placeholder-${currentPlaceholder}`}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 0.5 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="text-sm text-gray-400 whitespace-normal break-words leading-relaxed w-full pr-2"
            >
              {placeholders[currentPlaceholder]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
