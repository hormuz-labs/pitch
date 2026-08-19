import { motion } from 'framer-motion'

export const AnimatedSupportIcon = ({ active = false }: { active?: boolean }) => {
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
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.08, opacity: 1, rotate: -3 },
          active: { scale: 1, opacity: 1, rotate: 0, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      />
    </motion.svg>
  )
}
