import { motion } from 'framer-motion'

export const AnimatedPdfIcon = ({ active = false }: { active?: boolean }) => {
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
      <motion.path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.06, opacity: 1, rotate: -2 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      />
      <motion.polyline
        points="14 2 14 8 20 8"
        variants={{
          idle: { pathLength: 1, opacity: 0.8 },
          hover: { pathLength: 1, opacity: 1, x: 0.5, y: -0.5 },
          active: { pathLength: 1, opacity: 1, x: 0, y: 0 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
      <motion.line
        x1="16"
        y1="13"
        x2="8"
        y2="13"
        variants={{
          idle: { scaleX: 1, opacity: 0.7 },
          hover: { scaleX: 1.05, opacity: 1 },
          active: { scaleX: 1, opacity: 1 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.1 }}
      />
      <motion.line
        x1="16"
        y1="17"
        x2="8"
        y2="17"
        variants={{
          idle: { scaleX: 1, opacity: 0.7 },
          hover: { scaleX: 1.05, opacity: 1 },
          active: { scaleX: 1, opacity: 1 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.15 }}
      />
    </motion.svg>
  )
}
