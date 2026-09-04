import { motion } from 'framer-motion'

export const AnimatedSessionsIcon = ({ active = false }: { active?: boolean }) => {
  return (
    <motion.svg
      width="18"
      height="18"
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
    >
      <motion.rect
        x="3"
        y="4"
        width="18"
        height="14"
        rx="2"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.05, opacity: 1 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      />
      <motion.circle
        cx="12"
        cy="11"
        r="2.5"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.2, opacity: 1 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
      <motion.path
        d="M12 13.5V16"
        variants={{
          idle: { scaleY: 1, opacity: 0.7 },
          hover: { scaleY: 1.1, opacity: 1 },
          active: { scaleY: 1, opacity: 1 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.1 }}
      />
    </motion.svg>
  )
}
