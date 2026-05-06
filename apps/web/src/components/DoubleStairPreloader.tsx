import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export const DoubleStairPreloader = ({ onComplete }: { onComplete?: () => void }) => {
  const [isVisible, setIsVisible] = useState(true);

  // Prevent scroll while preloader is active
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const columns = 10;
  const sentence = "Automating cinematic product pitches.";
  const words = sentence.split(" ");
  
  // Give enough time for the sentence to appear and be read
  const openingDelay = 2.4; 

  // Layer 1 (Black) splits revealing the actual page
  const layer1TopAnim = {
    initial: { top: 0 },
    animate: (i: number) => ({
      top: "-51vh",
      transition: { duration: 0.8, delay: openingDelay + 0.08 * i, ease: [0.76, 0, 0.24, 1] as const }
    })
  };
  const layer1BottomAnim = {
    initial: { bottom: 0 },
    animate: (i: number) => ({
      bottom: "-51vh",
      transition: { duration: 0.8, delay: openingDelay + 0.08 * i, ease: [0.76, 0, 0.24, 1] as const }
    })
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      
      {/* Background container for layer 1 (Black) */}
      <div className="absolute inset-0 flex w-full h-full">
        {[...Array(columns)].map((_, i) => (
          <div key={`l1-col-${i}`} className="relative h-full flex-1">
            <motion.div
              custom={columns - i - 1}
              variants={layer1TopAnim}
              initial="initial"
              animate="animate"
              onAnimationComplete={() => {
                if (columns - i - 1 === columns - 1) {
                  setIsVisible(false);
                  if (onComplete) onComplete();
                }
              }}
              className="absolute left-[-1%] w-[102%] h-[51vh] bg-[#111111]"
            />
            <motion.div
              custom={columns - i - 1}
              variants={layer1BottomAnim}
              initial="initial"
              animate="animate"
              className="absolute left-[-1%] w-[102%] h-[51vh] bg-[#111111]"
            />
          </div>
        ))}
      </div>

      {/* Words Container */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center z-50 mix-blend-difference px-6"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: openingDelay - 0.2, duration: 0.5 }}
      >
        <div className="flex flex-nowrap justify-center gap-x-1.5 sm:gap-x-3 md:gap-x-4 lg:gap-x-6 w-full px-2 max-w-4xl overflow-hidden">
          {words.map((word, index) => (
            <motion.span
              key={index}
              className="text-white text-[3.5vw] sm:text-[24px] md:text-[35px] font-bold font-mono tracking-tight"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: index * 0.15,
                ease: [0.33, 1, 0.68, 1] // Custom easing for smooth pop
              }}
            >
              {word}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
