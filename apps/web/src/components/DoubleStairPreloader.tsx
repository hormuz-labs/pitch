import { motion, type Variants } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';

const WORD_GROUPS: { chars: string[]; italic: boolean }[] = [
  { chars: [...'Automating'], italic: false },
  { chars: [...'cinematic'],  italic: false },
  { chars: [...'product'],    italic: false },
  { chars: [...'pitches.'],   italic: true  },
];

const STAGGER     = 0.042;
const TYPE_DELAY  = 0.1;
const TOTAL_CHARS = WORD_GROUPS.reduce((n, w) => n + w.chars.length, 0);
const TYPE_END    = TYPE_DELAY + (TOTAL_CHARS - 1) * STAGGER + 0.01;
const CURSOR_START    = TYPE_END + 0.2;
const OPENING_DELAY   = CURSOR_START + 1.0;
const TEXT_FADE_DELAY = OPENING_DELAY - 0.2;

const columns = 10;

export const DoubleStairPreloader = ({ onComplete }: { onComplete?: () => void }) => {
  const alreadySeen = sessionStorage.getItem('preloader_done') === '1';
  const [isVisible, setIsVisible] = useState(!alreadySeen);
  const textRef    = useRef<HTMLDivElement>(null);
  const pitchesRef = useRef<HTMLSpanElement>(null);
  const cursorRef      = useRef<HTMLDivElement>(null);
  const rippleRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (alreadySeen) onComplete?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isVisible]);

  // Char-by-char typewriter
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

  // Cursor glide + click → hide _ on click
  useEffect(() => {
    const pitches = pitchesRef.current;
    const cursor  = cursorRef.current;
    const ripple  = rippleRef.current;
    if (!pitches || !cursor || !ripple) return;

    const tl = gsap.timeline({ delay: CURSOR_START });

    tl.call(() => {
      const r       = pitches.getBoundingClientRect();
      const isMobile = window.innerWidth < 768;
      const tx = r.left + r.width / 2 - 10;
      const ty = r.top  + r.height / 2 + (isMobile ? 2 : 8);
      gsap.set(cursor, { x: tx + 90, y: ty + 55, opacity: 0, scale: 1 });
      gsap.set(ripple, { x: tx, y: ty, opacity: 0, scale: 0 });
    });

    tl.to(cursor, { opacity: 1, duration: 0.18, ease: 'power2.out' });
    tl.to(cursor, {
      x: () => pitchesRef.current!.getBoundingClientRect().left + pitchesRef.current!.getBoundingClientRect().width / 2 - 10,
      y: () => { const isMobile = window.innerWidth < 768; return pitchesRef.current!.getBoundingClientRect().top + pitchesRef.current!.getBoundingClientRect().height / 2 + (isMobile ? 2 : 8); },
      duration: 0.45,
      ease: 'power3.out',
    }, '+=0.05');

    tl.to(cursor, { scale: 0.78, duration: 0.08, ease: 'power2.in' }, '+=0.06');
    tl.to(ripple, { opacity: 0.5, scale: 1,   duration: 0.15, ease: 'power2.out' }, '<');
    tl.to(ripple, { opacity: 0,   scale: 1.6, duration: 0.25, ease: 'power2.in' });
    tl.to(cursor, { opacity: 0,   duration: 0.12, ease: 'power2.in' }, '<');

    return () => { tl.kill(); };
  }, []);

  if (!isVisible) return null;

  const ease4 = [0.76, 0, 0.24, 1] as [number, number, number, number];
  const stairAnim = (dir: 'top' | 'bottom'): Variants => ({
    initial: dir === 'top' ? { top: 0 } : { bottom: 0 },
    animate: dir === 'top'
      ? (i: number) => ({ top: '-51vh',    transition: { duration: 0.8, delay: OPENING_DELAY + 0.08 * i, ease: ease4 } })
      : (i: number) => ({ bottom: '-51vh', transition: { duration: 0.8, delay: OPENING_DELAY + 0.08 * i, ease: ease4 } }),
  });

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden">

      {/* Stair columns */}
      <div className="absolute inset-0 flex w-full h-full">
        {[...Array(columns)].map((_, i) => (
          <div key={`col-${i}`} className="relative h-full flex-1">
            <motion.div
              custom={columns - i - 1}
              variants={stairAnim('top')}
              initial="initial"
              animate="animate"
              onAnimationComplete={() => {
                if (columns - i - 1 === columns - 1) {
                  sessionStorage.setItem('preloader_done', '1');
                  setIsVisible(false);
                  onComplete?.();
                }
              }}
              className="absolute left-[-1%] w-[102%] h-[51vh] bg-[#111111]"
            />
            <motion.div
              custom={columns - i - 1}
              variants={stairAnim('bottom')}
              initial="initial"
              animate="animate"
              className="absolute left-[-1%] w-[102%] h-[51vh] bg-[#111111]"
            />
          </div>
        ))}
      </div>

      {/* Text */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center z-50 mix-blend-difference px-6"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: TEXT_FADE_DELAY, duration: 0.5 }}
      >
        <div
          ref={textRef}
          className="flex flex-nowrap justify-center gap-x-1.5 sm:gap-x-3 md:gap-x-4 lg:gap-x-6"
          aria-label="Automating cinematic product pitches."
        >
          {WORD_GROUPS.map(({ chars, italic }, wi) => (
            <span
              key={wi}
              ref={italic ? pitchesRef : undefined}
              style={{
                display: 'inline-flex',
                fontStyle: italic ? 'italic' : 'normal',
                textDecoration: 'none',
                textUnderlineOffset: '4px',
              }}
            >
              {chars.map((ch, ci) => (
                <span
                  key={ci}
                  className="pre-char font-mono font-bold tracking-tight text-white"
                  style={{ fontSize: 'clamp(10px, 3.5vw, 35px)', opacity: 0, whiteSpace: 'pre' }}
                >
                  {ch}
                </span>
              ))}
            </span>
          ))}

        </div>
      </motion.div>

      {/* Cursor — rotated upward */}
      <div
        ref={cursorRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 22, height: 22,
          pointerEvents: 'none', zIndex: 60,
          opacity: 0, transformOrigin: '2px 2px',
          color: 'white',
          filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20.5056 10.7754C21.1225 10.5355 21.431 10.4155 21.5176 10.2459C21.5926 10.099 21.5903 9.92446 21.5115 9.77954C21.4205 9.61226 21.109 9.50044 20.486 9.2768L4.59629 3.5728C4.0866 3.38983 3.83175 3.29835 3.66514 3.35605C3.52029 3.40621 3.40645 3.52004 3.35629 3.6649C3.29859 3.8315 3.39008 4.08635 3.57304 4.59605L9.277 20.4858C9.50064 21.1088 9.61246 21.4203 9.77973 21.5113C9.92465 21.5901 10.0991 21.5924 10.2461 21.5174C10.4157 21.4308 10.5356 21.1223 10.7756 20.5054L13.3724 13.8278C13.4194 13.707 13.4429 13.6466 13.4792 13.5957C13.5114 13.5506 13.5508 13.5112 13.5959 13.479C13.6468 13.4427 13.7072 13.4192 13.828 13.3722L20.5056 10.7754Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
