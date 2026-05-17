import gsap from 'gsap';
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline';

const URL_CHARS = [...'https://acme.com'];

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const card = root.querySelector<HTMLElement>('.s1-card');
  const chars = root.querySelectorAll<HTMLElement>('.s1-char');
  const cursor = root.querySelector<HTMLElement>('.s1-cursor');
  const doneWrap = root.querySelector<HTMLElement>('.s1-done-wrap');
  const doneCheck = root.querySelector<SVGPolylineElement>('.s1-done-check');

  if (!card || !chars.length || !cursor || !doneWrap || !doneCheck) {
    return gsap.timeline({ paused: true });
  }

  const tl = gsap.timeline({ paused: true, onComplete });
  
  gsap.set(doneCheck, { strokeDasharray: 16, strokeDashoffset: 16 });

  tl.set(card, { opacity: 0, y: 10 })
    .set(chars, { opacity: 0 })
    .set(cursor, { opacity: 0 })
    .set(doneWrap, { opacity: 0, scale: 0 });

  tl.to(card, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });
  tl.to(cursor, { opacity: 1, duration: 0.05 }, '+=0.1');
  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 2, yoyo: true });
  tl.to(cursor, { opacity: 1, duration: 0.05 });
  tl.to(chars, { opacity: 1, duration: 0.01, stagger: 0.04, ease: 'none' }, '+=0.1');
  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 2, yoyo: true }, '+=0.2');
  tl.to(doneWrap, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '+=0.1');
  tl.to(doneCheck, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' });
  tl.to({}, { duration: 0.5 }); // buffer at end

  return tl;
}

interface Props {
  active: boolean;
  onComplete?: () => void;
}

export const Step1Illustration = ({ active, onComplete }: Props) => {
  const rootRef = useIllustrationTimeline(buildTimeline, active, onComplete);

  return (
    <div
      ref={rootRef}
      className="landing-step-illustration flex items-center justify-center p-6 h-full w-full"
      style={{ overflow: 'hidden' }}
      aria-hidden="true"
    >
      <div className="s1-card w-full max-w-[280px] bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative opacity-0">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 mb-1.5">
          <span className="text-red-500">*</span> Product URL
        </label>
        
        <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-900 bg-gray-50 flex items-center shadow-inner relative overflow-hidden h-9">
          <div className="flex items-center w-full">
            {URL_CHARS.map((ch, i) => (
              <span key={i} className="s1-char font-mono text-[11px] text-gray-900 opacity-0 whitespace-pre">
                {ch}
              </span>
            ))}
            <span className="s1-cursor inline-block w-[1.5px] h-[12px] bg-blue-500 ml-[1px] opacity-0" />
          </div>
          
          <div className="s1-done-wrap absolute right-3 opacity-0 scale-0">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="8" fill="#16a34a" />
              <polyline 
                className="s1-done-check" 
                points="4.5,8 7,10.5 11.5,5.5" 
                fill="none" 
                stroke="#fff" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
