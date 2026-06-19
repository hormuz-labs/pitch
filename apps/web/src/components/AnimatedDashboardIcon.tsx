import { motion } from 'framer-motion'

export const AnimatedDashboardIcon = ({ active = false }: { active?: boolean }) => {
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
      className="shrink-0"
    >
      <motion.rect
        x="3"
        y="3"
        width="7"
        height="7"
        rx="1"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.1, opacity: 1, rotate: -5 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      />
      <motion.rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.1, opacity: 1, rotate: 5 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.05 }}
      />
      <motion.rect
        x="14"
        y="14"
        width="7"
        height="7"
        rx="1"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.1, opacity: 1, rotate: -5 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.1 }}
      />
      <motion.rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="1"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.1, opacity: 1, rotate: 5 },
          active: { scale: 1, opacity: 1, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.15 }}
      />
    </motion.svg>
  )
}
