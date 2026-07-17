import { motion } from 'framer-motion'

export const AnimatedVideoIcon = ({ active = false }: { active?: boolean }) => {
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
        x="1"
        y="5"
        width="15"
        height="14"
        rx="2"
        ry="2"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.08, opacity: 1, rotate: -3 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      />
      <motion.polygon
        points="23 7 16 12 23 17"
        variants={{
          idle: { scale: 1, opacity: 0.8, x: 0 },
          hover: { scale: 1.15, opacity: 1, x: 1 },
          active: { scale: 1, opacity: 1, x: 0 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
    </motion.svg>
  )
}
