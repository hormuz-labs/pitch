import { motion } from 'framer-motion'

export const AnimatedAdminIcon = ({ active = false }: { active?: boolean }) => {
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
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        variants={{
          idle: { scale: 1, opacity: 0.8 },
          hover: { scale: 1.08, opacity: 1, rotate: 2 },
          active: { scale: 1, opacity: 1, rotate: 0, fill: 'currentColor' },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      />
    </motion.svg>
  )
}
