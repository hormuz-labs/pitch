import { cn } from '../lib/utils';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import useMeasure from 'react-use-measure';

export interface TimedUndoActionProps {
  initialSeconds?: number;
  deleteLabel?: string;
  undoLabel?: string;
  icon?: ReactNode;
  /** Called when the countdown expires (actual delete commits) */
  onConfirm?: () => void;
  /** Called when the user clicks to undo before countdown ends */
  onUndo?: () => void;
  /** Called after either confirm or undo has been handled (for cleanup) */
  onDismiss?: () => void;
}

export const TimedUndoAction: FC<TimedUndoActionProps> = ({
  initialSeconds = 5,
  deleteLabel = 'Video deleted',
  undoLabel = 'Undo delete',
  icon,
  onConfirm,
  onUndo,
  onDismiss,
}) => {
  // Start in deleting state (already triggered by the user clicking the card's delete button)
  const [isDeleting, setIsDeleting] = useState(true);
  const [countDown, setCountDown] = useState(initialSeconds);
  const [ref, bounds] = useMeasure({ offsetSize: true });

  const handleClick = () => {
    if (isDeleting) {
      // User clicked Undo
      setIsDeleting(false);
      onUndo?.();
      onDismiss?.();
    }
  };

  useEffect(() => {
    if (!isDeleting) return;

    const interval = setInterval(() => {
      setCountDown((prev) => {
        if (prev <= 1) {
          setIsDeleting(false);
          onConfirm?.();
          onDismiss?.();
          return initialSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isDeleting, initialSeconds, onConfirm, onDismiss]);

  return (
    <div className="flex w-full items-center justify-center font-sans">
      <div className="flex flex-col items-center justify-center will-change-transform">
        <MotionConfig
          transition={{
            type: 'spring',
            stiffness: 250,
            damping: 22,
          }}
        >
          <motion.div
            className={cn(
              'relative flex cursor-pointer items-center justify-start overflow-hidden rounded-full bg-red-500 transition-colors duration-300',
              isDeleting && 'bg-red-500/10',
            )}
            animate={{
              width: bounds.width > 0 ? bounds.width : 'auto',
            }}
            onClick={handleClick}
          >
            <div
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-1.5',
                isDeleting && 'px-2',
              )}
              ref={ref}
            >
              <AnimatePresence mode="popLayout">
                {isDeleting && (
                  <motion.div
                    className="rounded-full bg-red-500 p-1"
                    initial={{ opacity: 0, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(2px)' }}
                  >
                    {icon}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-center gap-1.5">
                <AnimatedText
                  text={isDeleting ? undoLabel : deleteLabel}
                  className={cn(
                    'z-10 text-xs font-medium',
                    isDeleting ? 'text-red-400' : 'text-neutral-50',
                  )}
                />
              </div>

              <AnimatePresence mode="popLayout">
                {isDeleting && (
                  <motion.div
                    className="flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-neutral-50 tabular-nums"
                    initial={{ opacity: 0, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(2px)' }}
                  >
                    <AnimatePresence mode="popLayout">
                      <motion.span
                        key={countDown}
                        className="text-xs font-medium"
                        initial={{ opacity: 0, y: -20, filter: 'blur(2px)', scale: 0.5 }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
                        exit={{ opacity: 0, y: 20, filter: 'blur(2px)', scale: 0.5 }}
                        transition={{
                          type: 'spring',
                          stiffness: 240,
                          damping: 20,
                          mass: 1,
                        }}
                      >
                        {countDown}
                      </motion.span>
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </MotionConfig>
      </div>
    </div>
  );
};

function AnimatedText({
  text,
  className,
  delayStep = 0.014,
}: {
  text: string;
  className?: string;
  delayStep?: number;
}) {
  const chars = text.split('');

  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          style={{ display: 'inline-flex', willChange: 'transform' }}
        >
          {chars.map((char, i) => (
            <motion.span
              key={i}
              initial={{ y: 10, opacity: 0, scale: 0.5, filter: 'blur(2px)' }}
              animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ y: -10, opacity: 0, scale: 0.5, filter: 'blur(2px)' }}
              transition={{
                type: 'spring',
                stiffness: 240,
                damping: 16,
                mass: 1.2,
                delay: i * delayStep,
              }}
              style={{
                display: 'inline-block',
                whiteSpace: char === ' ' ? 'pre' : undefined,
              }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default TimedUndoAction;
