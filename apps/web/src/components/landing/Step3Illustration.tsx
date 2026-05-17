import gsap from 'gsap';
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline';

const PHASES = ['Workspace Initialization', 'Video Recording', 'Encoding'];
const PHASE_PROGRESS = [20, 80, 100]; // target progress %

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const card = root.querySelector<HTMLElement>('.s3-card');
  const progressText = root.querySelectorAll<HTMLElement>('.s3-progress-text');
  const progressBar = root.querySelectorAll<HTMLElement>('.s3-progress-bar');
  const verticalLine = root.querySelector<HTMLElement>('.s3-vertical-line');
  const lConnectors = root.querySelectorAll<HTMLElement>('.s3-l-connector');
  const pendingIcons = root.querySelectorAll<HTMLElement>('.s3-icon-pending');
  const activeIcons = root.querySelectorAll<HTMLElement>('.s3-icon-active');
  const doneIcons = root.querySelectorAll<HTMLElement>('.s3-icon-done');
  const phaseTexts = root.querySelectorAll<HTMLElement>('.s3-phase-text');
  const runningBadges = root.querySelectorAll<HTMLElement>('.s3-running-badge');
  const statusLabel = root.querySelector<HTMLElement>('.s3-status-label');
  const completedCountLabel = root.querySelector<HTMLElement>('.s3-completed-count');

  if (!card || !verticalLine) {
    return gsap.timeline({ paused: true });
  }

  const tl = gsap.timeline({ paused: true, onComplete });

  tl.set(card, { opacity: 0, y: 10 })
    .set(progressBar, { width: '0%', backgroundColor: '#3b82f6' })
    .set(verticalLine, { height: '0%' })
    .set(pendingIcons, { display: 'flex', opacity: 1 })
    .set(activeIcons, { display: 'none', opacity: 0 })
    .set(doneIcons, { display: 'none', opacity: 0, scale: 0 })
    .set(phaseTexts, { color: '#374151' }) // text-gray-700
    .set(runningBadges, { opacity: 0, display: 'none' })
    .set(lConnectors, { borderColor: '#e5e7eb' }); // border-gray-200

  tl.call(() => {
    progressText.forEach(el => el.textContent = '0%');
    if (statusLabel) statusLabel.textContent = 'Queued';
    if (completedCountLabel) completedCountLabel.textContent = '0';
  });

  tl.to(card, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });

  // Dummy object for animating progress text
  const proxy = { p: 0, c: 0 };
  const updateProgress = () => {
    const rounded = Math.round(proxy.p);
    progressText.forEach(el => el.textContent = `${rounded}%`);
    progressBar.forEach(el => el.style.width = `${rounded}%`);
  };

  PHASES.forEach((_, i) => {
    const targetP = PHASE_PROGRESS[i];
    const duration = i === 0 ? 0.6 : i === 1 ? 1.4 : 0.8;

    tl.call(() => { if (statusLabel) statusLabel.textContent = i === 2 ? 'Finishing up…' : 'Running'; });
    
    tl.set(pendingIcons[i], { display: 'none', opacity: 0 });
    tl.set(activeIcons[i], { display: 'flex', opacity: 1 });
    tl.set(phaseTexts[i], { color: '#1d4ed8' }); // text-blue-700
    tl.set(runningBadges[i], { display: 'block' });
    tl.set(lConnectors[i], { borderColor: '#3b82f6' }); // border-blue-500
    tl.to(runningBadges[i], { opacity: 1, duration: 0.2 });

    tl.to(proxy, {
      p: targetP,
      duration: duration,
      ease: 'linear',
      onUpdate: updateProgress
    });

    tl.to(runningBadges[i], { opacity: 0, duration: 0.1 });
    tl.set(runningBadges[i], { display: 'none' });
    tl.set(activeIcons[i], { display: 'none', opacity: 0 });
    tl.set(doneIcons[i], { display: 'flex' });
    tl.to(doneIcons[i], { opacity: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' });
    tl.set(phaseTexts[i], { color: '#9ca3af' }); // text-gray-400
    tl.set(lConnectors[i], { borderColor: '#22c55e' }); // border-green-500
    
    tl.call(() => {
      proxy.c = i + 1;
      if (completedCountLabel) completedCountLabel.textContent = `${proxy.c}`;
    });
    
    // Update vertical line (connecting the phases)
    const lineTarget = i === 0 ? 0 : (i / (PHASES.length - 1)) * 100;
    tl.to(verticalLine, { height: `${lineTarget}%`, duration: 0.2, ease: 'power2.out' }, '-=0.1');
  });

  tl.to(progressBar, { backgroundColor: '#16a34a', duration: 0.3 }); // turn green
  tl.call(() => { if (statusLabel) statusLabel.textContent = 'Completed'; });
  
  tl.to({}, { duration: 0.5 }); // buffer at end

  return tl;
}

interface Props {
  active: boolean;
  onComplete?: () => void;
}

export const Step3Illustration = ({ active, onComplete }: Props) => {
  const rootRef = useIllustrationTimeline(buildTimeline, active, onComplete);

  return (
    <div
      ref={rootRef}
      className="landing-step-illustration flex items-center justify-center p-6 h-full w-full"
      style={{ overflow: 'hidden' }}
      aria-hidden="true"
    >
      <div className="s3-card w-full bg-white border-[1.5px] border-gray-200 rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 shadow-[0_4px_24px_0_rgba(0,0,0,0.07)] select-none opacity-0">
        
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between mb-3 md:mb-4 gap-2">
          <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl border-[1.5px] border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="md:w-5 md:h-5">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </div>
            <span className="font-bold text-sm md:text-base text-gray-900 leading-none truncate">Video Generation</span>
          </div>
        </div>

        {/* Phases list */}
        <div className="relative ml-1.5 md:ml-2.5 pl-5 md:pl-6 mb-4 md:mb-5">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-1 bottom-5 w-[2px] bg-gray-200 rounded-sm overflow-hidden">
            <div className="s3-vertical-line absolute top-0 left-0 w-full bg-green-500 transition-all duration-500" style={{ height: '0%' }} />
          </div>

          {PHASES.map((label, idx) => (
            <div key={idx} className={`flex flex-wrap items-center gap-1.5 md:gap-2.5 relative ${idx < PHASES.length - 1 ? 'mb-2.5 md:mb-3.5' : ''}`}>
              {/* L-shaped connector */}
              <div className="s3-l-connector absolute -left-5 md:-left-6 -top-2 w-[14px] md:w-[18px] h-5 md:h-6 border-b-[1.5px] md:border-b-2 border-l-[1.5px] md:border-l-2 rounded-bl-sm md:rounded-bl-md border-gray-200 transition-colors duration-500" />

              {/* Status Icons */}
              <span className="s3-icon-pending flex items-center justify-center w-4 h-4 md:w-5 md:h-5 rounded-full border-[1.5px] md:border-2 border-gray-300 shrink-0 bg-white z-10" />
              <span className="s3-icon-active hidden items-center justify-center w-4 h-4 md:w-5 md:h-5 rounded-full border-[1.5px] md:border-2 border-blue-500 shrink-0 bg-white z-10">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500" style={{ animation: 'vpw-pulse 1.2s ease-in-out infinite' }} />
              </span>
              <span className="s3-icon-done hidden items-center justify-center w-4 h-4 md:w-5 md:h-5 rounded-full bg-green-600 shrink-0 z-10 scale-0">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="md:w-[11px] md:h-[11px]">
                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>

              <span className="s3-phase-text text-[11px] md:text-sm font-medium text-gray-700 transition-colors">
                {label}
              </span>

              <span className="s3-running-badge text-[8px] md:text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-1.5 md:px-2 py-[1px] tracking-wide uppercase hidden">
                Running
              </span>
            </div>
          ))}
        </div>

        {/* Status Badge */}
        <div className="flex gap-2 flex-wrap mb-3 md:mb-4">
          <div className="flex items-center gap-1 md:gap-1.5 bg-blue-50 border border-blue-200 rounded-md md:rounded-lg py-0.5 md:py-1 px-2 md:px-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="md:w-3.5 md:h-3.5">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="s3-status-label text-[10px] md:text-xs font-bold text-blue-800">Queued</span>
          </div>
        </div>

        {/* Progress counter + full bar */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2 bg-gray-50 border border-gray-200 rounded-lg md:rounded-full py-1.5 px-2 md:px-3 w-full">
          <span className="text-[10px] md:text-[13px] font-semibold text-gray-400 whitespace-nowrap">
            <span className="s3-completed-count text-gray-700">0</span>/{PHASES.length}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden relative min-w-[40px]">
            <div className="s3-progress-bar h-full rounded-full relative overflow-hidden transition-all duration-600 ease-in-out" style={{ width: '0%', backgroundColor: '#3b82f6' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'vpw-shimmer 1.6s linear infinite' }} />
            </div>
          </div>
          <span className="s3-progress-text text-[10px] md:text-[13px] font-bold text-gray-700 whitespace-nowrap">0%</span>
        </div>

      </div>
    </div>
  );
};
