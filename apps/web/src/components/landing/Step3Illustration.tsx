import gsap from 'gsap';
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline';

const PHASES = ['Workspace Init', 'Video Recording', 'Encoding'];
const PHASE_PROGRESS = [15, 75, 100]; // target progress %

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const card = root.querySelector<HTMLElement>('.s3-card');
  const progressText = root.querySelector<HTMLElement>('.s3-progress-text');
  const progressBar = root.querySelector<HTMLElement>('.s3-progress-bar');
  const pendingIcons = root.querySelectorAll<HTMLElement>('.s3-icon-pending');
  const activeIcons = root.querySelectorAll<HTMLElement>('.s3-icon-active');
  const doneIcons = root.querySelectorAll<HTMLElement>('.s3-icon-done');
  const phaseTexts = root.querySelectorAll<HTMLElement>('.s3-phase-text');
  const runningBadges = root.querySelectorAll<HTMLElement>('.s3-running-badge');
  const statusLabel = root.querySelector<HTMLElement>('.s3-status-label');

  if (!card || !progressText || !progressBar) {
    return gsap.timeline({ paused: true });
  }

  const tl = gsap.timeline({ paused: true, onComplete });

  tl.set(card, { opacity: 0, y: 10 })
    .set(progressBar, { width: '0%', backgroundColor: '#3b82f6' })
    .set(pendingIcons, { opacity: 1 })
    .set(activeIcons, { opacity: 0 })
    .set(doneIcons, { opacity: 0, scale: 0 })
    .set(phaseTexts, { color: '#9ca3af' }) // text-gray-400
    .set(runningBadges, { opacity: 0, y: 5, display: 'none' });

  tl.call(() => {
    if (progressText) progressText.textContent = '0%';
    if (statusLabel) statusLabel.textContent = 'Queued';
  });

  tl.to(card, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });

  // Dummy object for animating progress text
  const proxy = { p: 0 };
  const updateProgress = () => {
    if (progressText) progressText.textContent = `${Math.round(proxy.p)}%`;
    if (progressBar) progressBar.style.width = `${proxy.p}%`;
  };

  PHASES.forEach((_, i) => {
    const targetP = PHASE_PROGRESS[i];
    const duration = i === 0 ? 0.5 : i === 1 ? 1.2 : 0.8;

    tl.call(() => { if (statusLabel) statusLabel.textContent = i === 2 ? 'Finishing up…' : 'Running'; });
    tl.set(pendingIcons[i], { opacity: 0 });
    tl.set(activeIcons[i], { opacity: 1 });
    tl.set(phaseTexts[i], { color: '#1d4ed8' }); // text-blue-700
    tl.set(runningBadges[i], { display: 'block' });
    tl.to(runningBadges[i], { opacity: 1, y: 0, duration: 0.2 });

    tl.to(proxy, {
      p: targetP,
      duration: duration,
      ease: 'linear',
      onUpdate: updateProgress
    });

    tl.to(runningBadges[i], { opacity: 0, duration: 0.1 });
    tl.set(runningBadges[i], { display: 'none' });
    tl.set(activeIcons[i], { opacity: 0 });
    tl.to(doneIcons[i], { opacity: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' });
    tl.set(phaseTexts[i], { color: '#9ca3af' }); // text-gray-400
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
      <div className="s3-card w-full max-w-[280px] bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative text-left opacity-0">
        
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border-[1.5px] border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-[13px] text-gray-900">Video Generation</div>
              <div className="text-[10px] font-medium text-blue-600 s3-status-label">Queued</div>
            </div>
          </div>
        </div>

        {/* Phases list */}
        <div className="relative ml-1.5 pl-5 mb-4 border-l-2 border-gray-100 flex flex-col gap-3">
          {PHASES.map((label, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 relative">
              {/* Phase icon container overlapping the left border */}
              <div className="absolute -left-[27px] w-4 h-4 bg-white flex items-center justify-center">
                <svg className="s3-icon-pending w-3 h-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <svg className="s3-icon-active w-3 h-3 text-blue-500 absolute opacity-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="16 48" className="animate-spin" />
                </svg>
                <svg className="s3-icon-done w-3.5 h-3.5 text-green-500 absolute opacity-0 scale-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <span className="s3-phase-text text-[11px] font-medium text-gray-400 transition-colors flex items-center">
                {label}
              </span>
              <div className="s3-running-badge text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-[1px] uppercase hidden">
                Running
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar footer */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden relative">
            <div className="s3-progress-bar h-full rounded-full transition-all" style={{ width: '0%', backgroundColor: '#3b82f6' }} />
          </div>
          <span className="s3-progress-text text-[11px] font-bold text-gray-500 w-8 text-right">0%</span>
        </div>
      </div>
    </div>
  );
};
