import { Send, Sparkle, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import type React from 'react'
import { useState } from 'react'
import { FaRegThumbsDown, FaRegThumbsUp, FaThumbsDown, FaThumbsUp } from 'react-icons/fa6'

interface FeedbackComponentProps {
  onSubmit?: (data: { rating: 'up' | 'down'; feedback: string }) => void
  compact?: boolean
}

const SPRING_CONFIG = {
  ease: 'easeInOut' as const,
  duration: 0.3,
}

export const FeedbackComponent: React.FC<FeedbackComponentProps> = ({
  onSubmit,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeRating, setActiveRating] = useState<'up' | 'down' | null>(null)
  const [animatingIcon, setAnimatingIcon] = useState<'up' | 'down' | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpen = (type: 'up' | 'down') => {
    if (animatingIcon) return // Prevent double clicks during animation
    setActiveRating(type)
    setAnimatingIcon(type)

    // Wait for the thumb pop animation to finish before expanding the card
    setTimeout(() => {
      setIsOpen(true)
      setAnimatingIcon(null)
    }, 500)
  }

  const handleClose = () => {
    setIsOpen(false)
    setTimeout(() => {
      setActiveRating(null)
      setFeedback('')
    }, 400)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRating) return
    setIsSubmitting(true)
    setTimeout(() => {
      onSubmit?.({ rating: activeRating, feedback })
      setIsSubmitting(false)
      handleClose()
    }, 800)
  }

  return (
    <div className={`relative flex items-center justify-center ${compact ? 'w-auto' : 'w-full'}`}>
      <LayoutGroup id="feedback-group">
        <AnimatePresence mode="popLayout">
          {!isOpen ? (
            <motion.div
              key="initial-buttons"
              className={compact ? 'flex gap-1.5' : 'flex gap-3'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              {(['up', 'down'] as const).map(type => (
                <motion.button
                  key={type}
                  layoutId={activeRating === type ? 'feedback-card' : `button-${type}`}
                  onClick={() => handleOpen(type)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING_CONFIG}
                  className={`relative flex items-center justify-center overflow-visible border border-gray-200 bg-white transition-colors hover:bg-gray-50 ${
                    compact
                      ? 'h-8 w-8 rounded-lg'
                      : 'h-10 w-10 rounded-xl shadow-sm hover:shadow-md sm:h-12 sm:w-12'
                  }`}
                >
                  <AnimatePresence>
                    {animatingIcon === type && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        {[...Array(6)].map((_, i) => {
                          const angle = (i * 60 * Math.PI) / 180
                          const distance = 30
                          return (
                            <motion.div
                              key={`sparkle-${i}`}
                              className={`absolute text-gray-800`}
                              initial={{
                                scale: 0,
                                x: 0,
                                y: 0,
                                opacity: 1,
                                rotate: 0,
                              }}
                              animate={{
                                scale: [0, 1, 0],
                                x: Math.cos(angle) * distance,
                                y: Math.sin(angle) * distance,
                                opacity: [1, 1, 0],
                                rotate: [0, 90],
                              }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                            >
                              <Sparkle className="size-2 sm:size-3" fill="currentColor" />
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                  </AnimatePresence>

                  <motion.div
                    className="relative z-10 text-gray-700"
                    animate={
                      animatingIcon === type
                        ? {
                            scale: [1, 1.5, 1],
                            rotate: [0, type === 'up' ? -25 : 25, type === 'down' ? 25 : -25, 0],
                            y: [0, -2, 0],
                          }
                        : { scale: 1, rotate: 0, y: 0 }
                    }
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  >
                    {type === 'up' ? (
                      activeRating === 'up' ? (
                        <FaThumbsUp className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4 sm:h-5 sm:w-5'} />
                      ) : (
                        <FaRegThumbsUp
                          className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4 sm:h-5 sm:w-5'}
                        />
                      )
                    ) : activeRating === 'down' ? (
                      <FaThumbsDown className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4 sm:h-5 sm:w-5'} />
                    ) : (
                      <FaRegThumbsDown
                        className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4 sm:h-5 sm:w-5'}
                      />
                    )}
                  </motion.div>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
                onClick={handleClose}
              />
              <div className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none p-4">
                <motion.div
                  key="modal"
                  layoutId="feedback-card"
                  className="relative pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-2xl"
                  transition={SPRING_CONFIG}
                >
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.1 }}
                    onClick={e => {
                      e.stopPropagation()
                      handleClose()
                    }}
                    className="absolute top-3 right-3 z-10 rounded-full bg-gray-50 p-1.5 text-gray-500 transition-all hover:scale-110 hover:text-gray-900 hover:bg-gray-100 active:scale-90 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </motion.button>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative pt-1"
                  >
                    <h2 className="mb-1 text-base font-bold text-gray-900 pr-8">Share Feedback</h2>

                    <p className="mb-4 text-xs text-gray-500 pr-6">
                      {activeRating === 'up'
                        ? 'Let us know what you liked most?'
                        : 'What can we improve?'}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div>
                        <textarea
                          value={feedback}
                          onChange={e => setFeedback(e.target.value)}
                          placeholder="Type in your feedback (optional)"
                          className="h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 transition-all outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                      >
                        <Send size={16} className="fill-current" />
                        <span>{isSubmitting ? 'Sending...' : 'Send Now'}</span>
                      </button>
                    </form>
                  </motion.div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
