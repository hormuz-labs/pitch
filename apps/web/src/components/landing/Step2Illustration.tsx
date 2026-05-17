import gsap from 'gsap';
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline';

const PROMPT_TEXT = 'Show the onboarding process and highlight key product features...';

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const card = root.querySelector<HTMLElement>('.s2-card');
  const typed = root.querySelector<HTMLSpanElement>('.s2-typed');
  const cursor = root.querySelector<HTMLElement>('.s2-cursor');
  const options = root.querySelectorAll<HTMLElement>('.s2-option');

  if (!card || !typed || !cursor || !options.length) {
    return gsap.timeline({ paused: true });
  }

  const tl = gsap.timeline({ paused: true, onComplete });

  tl.set(card, { opacity: 0, y: 10 })
    .set(cursor, { opacity: 0 })
    .set(options, { opacity: 0, y: 5, scale: 0.95 });
  tl.call(() => { typed.textContent = ''; });

  tl.to(card, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });
  tl.to(cursor, { opacity: 1, duration: 0.05 }, '+=0.1');
  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 1, yoyo: true });
  tl.to(cursor, { opacity: 1, duration: 0.05 });

  const chars = [...PROMPT_TEXT];
  chars.forEach((_, i) => {
    tl.call(() => { typed.textContent = PROMPT_TEXT.slice(0, i + 1); }, [], '+=0.02');
  });

  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 2, yoyo: true }, '+=0.1');
  tl.to(options, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(2)', stagger: 0.1 }, '+=0.1');

  return tl;
}

interface Props {
  active: boolean;
  onComplete?: () => void;
}

export const Step2Illustration = ({ active, onComplete }: Props) => {
  const rootRef = useIllustrationTimeline(buildTimeline, active, onComplete);

  return (
    <div
      ref={rootRef}
      className="landing-step-illustration flex items-center justify-center p-6 h-full w-full"
      style={{ overflow: 'hidden' }}
      aria-hidden="true"
    >
      <div className="s2-card w-full max-w-[280px] bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative opacity-0">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 mb-1.5">
          <span className="text-red-500">*</span> What should the AI agent do?
        </label>
        
        <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 bg-gray-50 min-h-[50px] shadow-inner text-left leading-relaxed break-words">
          <span className="s2-typed font-sans text-gray-800 font-medium" />
          <span className="s2-cursor inline-block w-[1.5px] h-[12px] bg-blue-500 ml-[1px] opacity-0 align-middle" />
        </div>

        <div className="flex gap-2 mt-3">
          <div className="s2-option flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-2.5 py-1 shadow-sm opacity-0">
            <span className="text-[10px] text-gray-400 font-medium">Voice</span>
            <span className="text-[10px] text-gray-700 font-bold">Orus</span>
          </div>
          <div className="s2-option flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-2.5 py-1 shadow-sm opacity-0">
            <span className="text-[10px] text-gray-400 font-medium">Theme</span>
            <span className="text-[10px] text-gray-700 font-bold">Cinematic</span>
          </div>
        </div>
      </div>
    </div>
  );
};
