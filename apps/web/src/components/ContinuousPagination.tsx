/**
 * Page selector for the blog index.
 *
 * The active page is a single ink pill shared across slots via `layoutId`, so
 * moving between pages reads as one object travelling rather than two fading.
 * Everything else is hairline-bordered and flat, matching the nav pills and the
 * blog category filters — see src/styles/pagination.css.
 */
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type FC, useState } from 'react'
import '../styles/pagination.css'

export interface ContinuousPaginationProps {
  totalPages?: number
  defaultPage?: number
  onPageChange?: (page: number) => void
}

export const ContinuousPagination: FC<ContinuousPaginationProps> = ({
  totalPages = 5,
  defaultPage = 1,
  onPageChange,
}) => {
  const [active, setActive] = useState<number>(defaultPage)

  const paginate = (page: number) => {
    if (page < 1 || page > totalPages) return
    setActive(page)
    onPageChange?.(page)
  }

  return (
    <nav className="pg-root" aria-label="Blog pages">
      <button
        type="button"
        className="pg-btn"
        onClick={() => paginate(active - 1)}
        disabled={active === 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} aria-hidden />
      </button>

      <div className="pg-pages">
        {Array.from({ length: totalPages }).map((_, i) => {
          const page = i + 1
          const isActive = page === active
          return (
            <button
              type="button"
              key={page}
              onClick={() => paginate(page)}
              className={`pg-btn pg-page${isActive ? ' is-on' : ''}`}
              aria-label={`Page ${page}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="pg-active"
                  className="pg-page-fill"
                  transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 0.7 }}
                />
              )}
              <span className="pg-page-label">{page}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="pg-btn"
        onClick={() => paginate(active + 1)}
        disabled={active === totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}
