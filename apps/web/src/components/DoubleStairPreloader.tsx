import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';

// "Automating cinematic product pitches."
const SEGMENTS: [string, boolean][] = [
  ['Automating cinematic product ', false],
  ['pitches', true],
  ['.', false],
];

// Total chars for timing calculation
const ALL_TEXT = SEGMENTS.map(([t]) => t).join('');
const STAGGER = 0.042;
const TYPE_DELAY = 0.1;
// When typing ends: TYPE_DELAY + (charCount - 1) * STAGGER + 0.01
const TYPE_END = TYPE_DELAY + (ALL_TEXT.length - 1) * STAGGER + 0.01;

export const DoubleStairPreloader = ({ onComplete }: { onComplete?: () => void }) => {
  const alreadySeen = sessionStorage.getItem('preloader_done') === '1';
  const [isVisible, setIsVisible] = useState(!alreadySeen);
  const textRef    = useRef<HTMLDivElement>(null);
  const pitchesRef = useRef<HTMLSpanElement>(null);
  const cursorRef  = useRef<HTMLDivElement>(null);
  const rippleRef  = useRef<HTMLDivElement>(null);

  // If already seen this session, fire onComplete immediately
  useEffect(() => {
    if (alreadySeen) onComplete?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent scroll while preloader is active
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isVisible]);

  // GSAP typewriter on chars
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const chars = el.querySelectorAll<HTMLElement>('.pre-char');
    gsap.set(chars, { opacity: 0 });
    gsap.to(chars, {
      opacity: 1,
      duration: 0.01,
      stagger: STAGGER,
      ease: 'none',
      delay: TYPE_DELAY,
    });
  }, []);

  // Mouse cursor animation after typing
  useEffect(() => {
    const pitches = pitchesRef.current;
    const cursor  = cursorRef.current;
    const ripple  = rippleRef.current;
    if (!pitches || !cursor || !ripple) return;

    // Delay until after typing completes + tiny pause
    const delay = TYPE_END + 0.12;

    const tl = gsap.timeline({ delay });

    tl.call(() => {
      // Calculate pitches center in viewport at animation time
      const r = pitches.getBoundingClientRect();
      const tx = r.left + r.width / 2 - 10;
      const ty = r.top  + r.height / 2 - 10;
      // Start cursor below-right of target
      gsap.set(cursor, { x: tx + 90, y: ty + 55, opacity: 0, scale: 1 });
      gsap.set(ripple, { x: tx, y: ty, opacity: 0, scale: 0 });
    });

    // Fade in cursor
    tl.to(cursor, { opacity: 1, duration: 0.18, ease: 'power2.out' });

    // Glide to pitches word
    tl.to(cursor, {
      x: () => {
        const r = pitches.getBoundingClientRect();
        return r.left + r.width / 2 - 10;
      },
      y: () => {
        const r = pitches.getBoundingClientRect();
        return r.top + r.height / 2 - 10;
      },
      duration: 0.45,
      ease: 'power3.out',
    }, '+=0.05');

    // Click: press down
    tl.to(cursor, { scale: 0.78, duration: 0.08, ease: 'power2.in' }, '+=0.06');

    // Ripple on click
    tl.to(ripple, { opacity: 0.5, scale: 1, duration: 0.15, ease: 'power2.out' }, '<');
    tl.to(ripple, { opacity: 0, scale: 1.6, duration: 0.25, ease: 'power2.in' });

    // Click: release
    tl.to(cursor, { scale: 1, duration: 0.15, ease: 'back.out(3)' }, '<');

    return () => { tl.kill(); };
  }, []);

  if (!isVisible) return null;

  const columns = 10;
  const openingDelay = TYPE_END + 0.85; // after cursor click finishes

  const layer1TopAnim = {
    initial: { top: 0 },
    animate: (i: number) => ({
      top: '-51vh',
      transition: { duration: 0.8, delay: openingDelay + 0.08 * i, ease: [0.76, 0, 0.24, 1] as const },
    }),
  };
  const layer1BottomAnim = {
    initial: { bottom: 0 },
    animate: (i: number) => ({
      bottom: '-51vh',
      transition: { duration: 0.8, delay: openingDelay + 0.08 * i, ease: [0.76, 0, 0.24, 1] as const },
    }),
  };

  const textFadeDelay = openingDelay - 0.2;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">

      {/* Stair columns */}
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
                  sessionStorage.setItem('preloader_done', '1');
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

      {/* Text container — fades out before stair opens */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center z-50 mix-blend-difference px-6"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: textFadeDelay, duration: 0.5 }}
      >
        <div
          ref={textRef}
          className="flex flex-wrap justify-center w-full max-w-3xl px-2"
          aria-label="Automating cinematic product pitches."
        >
          {SEGMENTS.map(([part, isPitch], si) => {
            const chars = [...part];
            return isPitch ? (
              <span key={si} ref={pitchesRef} style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
                {chars.map((char, i) => (
                  <span
                    key={i}
                    className="pre-char"
                    style={{
                      fontStyle: 'italic',
                      textDecoration: 'underline',
                      textUnderlineOffset: '4px',
                      fontWeight: 700,
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 'clamp(22px, 3.5vw, 40px)',
                      color: '#fff',
                      letterSpacing: '-0.5px',
                      whiteSpace: 'pre',
                    }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            ) : (
              chars.map((char, i) => (
                <span
                  key={`${si}-${i}`}
                  className="pre-char"
                  style={{
                    fontWeight: 300,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 'clamp(22px, 3.5vw, 40px)',
                    color: '#fff',
                    letterSpacing: '-0.5px',
                    whiteSpace: 'pre',
                  }}
                >
                  {char}
                </span>
              ))
            );
          })}
        </div>
      </motion.div>

      {/* Mouse cursor */}
      <div
        ref={cursorRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 22, height: 22,
          pointerEvents: 'none', zIndex: 60,
          opacity: 0, transformOrigin: '2px 2px',
        }}
      >
        <svg viewBox="0 0 20 24" width="22" height="22" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
          <path d="M4,1 L4,18 L8,14 L11,20 L13,19 L10,13 L15,13 Z" fill="white" stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Click ripple */}
      <div
        ref={rippleRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 28, height: 28,
          marginLeft: -4, marginTop: -4,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.8)',
          pointerEvents: 'none', zIndex: 59,
          opacity: 0, transformOrigin: 'center',
        }}
      />
    </div>
  );
};
