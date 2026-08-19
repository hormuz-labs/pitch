import { motion } from 'framer-motion'

export const AnimatedShareIcon = ({ active = false }: { active?: boolean }) => {
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
      <motion.circle
        cx="18"
        cy="5"
        r="3"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.2, opacity: 1 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      />
      <motion.circle
        cx="6"
        cy="12"
        r="3"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.2, opacity: 1 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
      <motion.circle
        cx="18"
        cy="19"
        r="3"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.2, opacity: 1 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.1 }}
      />
      <motion.line
        x1="8.59"
        y1="13.51"
        x2="15.42"
        y2="17.49"
        variants={{
          idle: { pathLength: 1, opacity: 0.7 },
          hover: { pathLength: 1, opacity: 1 },
          active: { pathLength: 1, opacity: 1 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
      <motion.line
        x1="15.41"
        y1="6.51"
        x2="8.59"
        y2="10.49"
        variants={{
          idle: { pathLength: 1, opacity: 0.7 },
          hover: { pathLength: 1, opacity: 1 },
          active: { pathLength: 1, opacity: 1 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
    </motion.svg>
  )
}
