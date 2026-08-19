import { ChevronDown } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { type FC, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

export interface Option {
  id: string
  label: string
  icon: React.ElementType
}

interface OptionPickerProps {
  options: Option[]
  selectedId: string
  onSelect: (id: string) => void
}

export const OptionPicker: FC<OptionPickerProps> = ({ options, selectedId, onSelect }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const selected = options.find(o => o.id === selectedId) || options[0]
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOpen = () => setIsOpen(prev => !prev)
  const handleSelect = (option: Option) => {
    onSelect(option.id)
    setIsOpen(false)
  }

  const data = options

  return (
    <div className="relative inline-block perspective-[1200px] transform-3d" ref={containerRef}>
      <MotionConfig transition={{ type: 'spring', damping: 20, stiffness: 300 }}>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
                filter: 'blur(4px)',
                scale: 1.1,
                rotateX: -70,
              }}
              animate={{
                opacity: 1,
                y: -5,
                filter: 'blur(0px)',
                scale: 1,
                rotateX: 0,
              }}
              exit={{
                opacity: 0,
                y: 10,
                filter: 'blur(4px)',
                scale: 1.1,
                rotateX: -70,
              }}
              className="absolute top-full mt-2 left-0 z-50 origin-top transform-3d"
              role="menu"
            >
              <div className="relative flex flex-col min-w-max gap-1 rounded-2xl border border-neutral-100 bg-[#F3F3F3] p-1.5 whitespace-nowrap shadow-lg">
                {data.map(option => {
                  const isActive = selected.id === option.id

                  return (
                    <motion.button
                      key={option.id}
                      onClick={() => handleSelect(option)}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ x: 2 }}
                      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 bg-[#FEFEFE] ${isActive ? 'text-[#010101]' : 'text-[#6E6E6E]'}`}
                    >
                      <motion.span>
                        <option.icon size={16} />
                      </motion.span>
                      <span className="text-bold relative z-10 text-sm font-medium">
                        {option.label}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          layout="size"
          onClick={toggleOpen}
          whileTap={{ scale: 0.97 }}
          aria-expanded={isOpen}
          className={`flex items-center w-full gap-2 rounded-xl border border-transparent px-3 py-2.5 transition-all duration-300 select-none ${isOpen ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-white shadow-md'}`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, scale: 0.5, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.5, filter: 'blur(4px)' }}
              className="flex items-center gap-2"
            >
              <selected.icon size={16} className="transition-colors duration-300" />
            </motion.div>
          </AnimatePresence>
          <AnimatedText value={selected.label} className="text-sm font-medium" />

          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="flex items-center ml-auto">
            <ChevronDown size={16} className="transition-colors duration-300" strokeWidth={2.5} />
          </motion.div>
        </motion.button>
      </MotionConfig>
    </div>
  )
}

const AnimatedText = ({ value, className }: { value: string; className?: string }) => {
  return (
    <div className={cn('flex tracking-tight will-change-transform', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        {value.split('').map((char, index) => {
          const displayChar = char === ' ' ? '\u00A0' : char

          return (
            <motion.span
              key={char + index}
              layout
              initial={{ opacity: 0, y: 5, scale: 0.7 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                  type: 'spring',
                  stiffness: 200,
                  damping: 20,
                  delay: 0.03 * index,
                },
              }}
              exit={{ opacity: 0, y: -5, scale: 0.7 }}
            >
              {displayChar}
            </motion.span>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
