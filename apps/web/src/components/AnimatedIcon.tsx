import { motion } from 'framer-motion'

interface AnimatedIconProps {
  active?: boolean
  size?: number
  children: React.ReactNode
}

export const AnimatedIcon = ({ active = false, size = 18, children }: AnimatedIconProps) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={active ? 'active' : 'idle'}
      whileHover="hover"
      whileTap="hover"
      overflow="visible"
      className="shrink-0"
      variants={{
        idle: { scale: 1, opacity: 0.85, rotate: 0 },
        hover: { scale: 1.1, opacity: 1, rotate: 4 },
        active: { scale: 1, opacity: 1, rotate: 0 },
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 12 }}
    >
      {children}
    </motion.svg>
  )
}
