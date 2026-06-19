import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { FiShare } from 'react-icons/fi'
import { cn } from '../lib/utils'

interface User {
  id: string
  name: string
  avatar?: string
  icon?: React.ReactNode
  bgClass?: string
  /** If true, onShareComplete is called immediately on click instead of waiting for the animation */
  immediate?: boolean
}

interface ShareSheetProps {
  users: User[]
  onShareComplete?: (user: User) => void
  className?: string
  triggerContent?: React.ReactNode
  containerClassName?: string
  placement?: 'top' | 'bottom'
}

const springTransition = {
  type: 'spring',
  stiffness: 240,
  damping: 20,
  mass: 1,
} as const

export const ShareSheet = ({
  users,
  onShareComplete,
  className,
  triggerContent,
  containerClassName,
  placement = 'bottom',
}: ShareSheetProps) => {
  const [status, setStatus] = useState<'idle' | 'open' | 'sending' | 'success'>('idle')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleSelectUser = (user: User) => {
    setSelectedUser(user)
    setStatus('sending')

    // For options like "Copy URL" we fire the action immediately so the
    // clipboard write happens at the moment of click, not after the animation.
    if (user.immediate) {
      onShareComplete?.(user)
    }

    setTimeout(() => {
      setStatus('success')

      setTimeout(() => {
        setStatus('idle')
        setSelectedUser(null)
        if (!user.immediate) {
          onShareComplete?.(user)
        }
      }, 800)
    }, 1800)
  }

  return (
    <div className={cn('relative', containerClassName)} onClick={e => e.stopPropagation()}>
      <motion.button
        onClick={e => {
          e.stopPropagation()
          if (status === 'idle') setStatus('open')
        }}
        className={
          className ||
          'relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-black/70 text-white drop-shadow-md hover:bg-black transition-colors'
        }
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springTransition}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {status === 'idle' && (
            <motion.div
              key="share-icon"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              className="flex items-center justify-center gap-2 w-full h-full"
            >
              {triggerContent || <FiShare size={13} strokeWidth={2.5} />}
            </motion.div>
          )}

          {(status === 'sending' || status === 'success') && (
            <motion.div
              key="sending-container"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
              }}
              className={cn(
                'absolute inset-0 m-auto flex items-center justify-center overflow-hidden bg-black/70 text-white shadow-sm',
                className ? 'h-full w-full rounded-lg' : 'h-7 w-7 rounded-md',
              )}
            >
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                <svg className="pointer-events-none absolute inset-0 m-auto h-7 w-7 -rotate-90">
                  <rect
                    x="4"
                    y="4"
                    width="20"
                    height="20"
                    rx="3"
                    stroke="currentColor"
                    strokeOpacity="0.15"
                    strokeWidth="2"
                    fill="transparent"
                  />

                  <motion.rect
                    x="4"
                    y="4"
                    width="20"
                    height="20"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="transparent"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.8, ease: 'easeInOut' }}
                  />
                </svg>

                {selectedUser?.icon ? (
                  <motion.div
                    key="sending-icon"
                    layoutId="avatar-morph"
                    className="absolute inset-0 m-auto size-3 flex items-center justify-center text-white"
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.3 }}
                  >
                    {selectedUser.icon}
                  </motion.div>
                ) : selectedUser?.avatar ? (
                  <motion.img
                    key="sending-avatar"
                    layoutId="avatar-morph"
                    src={selectedUser.avatar}
                    className="absolute inset-0 m-auto size-3 rounded-full object-cover"
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.3 }}
                  />
                ) : (
                  <div className="text-gray-500 font-bold text-[10px]">
                    {selectedUser?.name.charAt(0)}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {status === 'success' && (
                    <motion.div
                      key="success-check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 20,
                      }}
                      className="absolute inset-0 m-auto flex h-7 w-7 items-center justify-center bg-black/70 rounded-md z-10 text-white"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {status === 'open' && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={e => {
              e.stopPropagation()
              setStatus('idle')
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        {status === 'open' && (
          <motion.div
            key="dropdown"
            className={cn(
              'absolute right-0 z-50 w-[190px] rounded-[16px] bg-white/95 backdrop-blur-md p-2 shadow-2xl border border-zinc-150',
              placement === 'top' ? 'bottom-[46px]' : 'top-9',
            )}
            initial={{
              opacity: 0,
              scale: 0,
              transformOrigin: placement === 'top' ? 'bottom right' : 'top right',
            }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={springTransition}
            onClick={e => e.stopPropagation()}
          >
            <div className="relative flex flex-col gap-1">
              {users.map(user => (
                <motion.div
                  layout
                  key={user.id}
                  onHoverStart={() => setHoveredId(user.id)}
                  onHoverEnd={() => setHoveredId(null)}
                  onClick={() => handleSelectUser(user)}
                  className={cn(
                    'group relative z-10 flex cursor-pointer items-center gap-3 p-1.5 rounded-[12px] transition-colors',
                  )}
                  animate={{
                    x: hoveredId === user.id ? -4 : 0,
                  }}
                >
                  {hoveredId === user.id && (
                    <motion.div
                      layoutId="hover-bg"
                      className="absolute inset-0 -z-10 rounded-[12px] bg-gradient-to-r from-zinc-50 to-white border border-zinc-100/80 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                      transition={springTransition}
                    />
                  )}

                  <motion.div
                    layout
                    className={cn(
                      'relative h-7 w-7 overflow-hidden flex items-center justify-center rounded-full transition-all duration-300',
                      user.bgClass || 'bg-gray-100 text-gray-700 border border-gray-200',
                    )}
                    animate={{
                      borderRadius: hoveredId === user.id ? '8px' : '14px',
                    }}
                    transition={springTransition}
                  >
                    {user.icon ? (
                      <motion.div
                        layout
                        layoutId={selectedUser?.id === user.id ? 'avatar-morph' : `icon-${user.id}`}
                        className="h-full w-full flex items-center justify-center bg-transparent"
                      >
                        {user.icon}
                      </motion.div>
                    ) : user.avatar ? (
                      <motion.img
                        layout
                        layoutId={selectedUser?.id === user.id ? 'avatar-morph' : `img-${user.id}`}
                        src={user.avatar}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-gray-500 font-bold text-[10px]">
                        {user.name.charAt(0)}
                      </div>
                    )}
                  </motion.div>

                  <motion.span
                    layout
                    className="text-[13px] font-semibold tracking-wide text-zinc-700 antialiased group-hover:text-zinc-900 transition-colors"
                  >
                    {user.name}
                  </motion.span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
