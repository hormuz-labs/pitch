import { useState, type FC, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* --- Types --- */

export interface ContinuousPaginationProps {
  totalPages?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
}

/* --- Sub-Components --- */

interface PageButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

const PageButton: FC<PageButtonProps> = ({ children, onClick, disabled }) => (
  <motion.button
    onClick={onClick}
    disabled={disabled}
    className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center border border-black/[0.08] bg-white shadow-sm"
    style={{
      color: disabled ? '#d1d5db' : '#6b7280',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}
    whileHover={!disabled ? { scale: 1.08, y: -4, boxShadow: '0 6px 16px rgba(0,0,0,0.10)' } : {}}
    whileTap={!disabled ? { scale: 0.92 } : {}}
    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
  >
    {children}
  </motion.button>
);

/* --- Main Component --- */

export const ContinuousPagination: FC<ContinuousPaginationProps> = ({
  totalPages = 5,
  defaultPage = 1,
  onPageChange,
}) => {
  const [active, setActive] = useState<number>(defaultPage);

  const paginate = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setActive(page);
    onPageChange?.(page);
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 text-sm select-none">
      {/* Prev */}
      <PageButton onClick={() => paginate(active - 1)} disabled={active === 1}>
        <ChevronLeft className="w-5 h-5" />
      </PageButton>

      {/* Pages */}
      <div className="relative flex gap-2 sm:gap-3">
        {Array.from({ length: totalPages }).map((_, i) => {
          const page = i + 1;
          const isActive = page === active;

          return (
            <motion.button
              key={page}
              onClick={() => paginate(page)}
              className={`relative z-10 h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center text-sm font-semibold border border-black/[0.08] shadow-sm cursor-pointer transition-colors duration-200 ${
                isActive ? 'text-white' : 'bg-white text-gray-500 hover:text-gray-900'
              }`}
              whileHover={!isActive ? { y: -4, boxShadow: '0 8px 20px rgba(0,0,0,0.12)' } : {}}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              {/* Active background */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="active-bg"
                    className="absolute inset-0 rounded-xl overflow-hidden"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 24, mass: 0.8 }}
                  >
                    <div
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: 'linear-gradient(135deg, #2a2a2e 0%, #1a1a1c 50%, #0a0a0c 100%)',
                        border: '1px solid #3a3a3e',
                        boxShadow: '0 8px 16px -4px rgba(0,0,0,0.5), inset 0 1px 1px 0 rgba(255,255,255,0.12)',
                      }}
                    />
                    {/* Shimmer */}
                    <motion.div
                      className="absolute -inset-full skew-x-12"
                      style={{ background: 'linear-gradient(to tr, transparent, rgba(255,255,255,0.08), transparent)' }}
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
                    />
                    <span
                      className="absolute inset-0 rounded-[inherit] pointer-events-none"
                      style={{ boxShadow: 'inset 0 -4px 8px 0 rgba(0,0,0,0.4)' }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <span className="relative z-10 text-base font-semibold">{page}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Next */}
      <PageButton onClick={() => paginate(active + 1)} disabled={active === totalPages}>
        <ChevronRight className="w-5 h-5" />
      </PageButton>
    </div>
  );
};
