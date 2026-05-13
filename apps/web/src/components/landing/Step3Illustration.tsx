import gsap from 'gsap';
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline';

const STEPS = [
  'Analyze content & extract messages',
  'Generate voiceover & narration',
  'Render & export video',
];
const STEP_TIMING = [800, 600, 500];

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const header  = root.querySelector<HTMLElement>('.s3-header');
  const counter = root.querySelector<HTMLElement>('.s3-counter');
  const items   = root.querySelectorAll<HTMLElement>('.s3-item');
  const dlWrap  = root.querySelector<HTMLElement>('.s3-dl-wrap');
  const dlCirc  = root.querySelector<SVGCircleElement>('.s3-dl-circ');
  const dlFill  = root.querySelector<SVGCircleElement>('.s3-dl-fill');
  const dlCheck = root.querySelector<SVGPolylineElement>('.s3-dl-check');
  const dlBar   = root.querySelector<HTMLElement>('.s3-dl-bar');

  if (!header || !counter || !items.length || !dlWrap || !dlCirc || !dlFill || !dlCheck) {
    return gsap.timeline({ paused: true });
  }

  const pendingIcons = root.querySelectorAll<HTMLElement>('.s3-icon-pending');
  const activeIcons  = root.querySelectorAll<HTMLElement>('.s3-icon-active');
  const doneIcons    = root.querySelectorAll<HTMLElement>('.s3-icon-done');
  const itemTexts    = root.querySelectorAll<HTMLElement>('.s3-item-text');

  const R = 13;
  const CIRC = 2 * Math.PI * R;

  gsap.set(dlCirc,  { strokeDasharray: CIRC, strokeDashoffset: CIRC });
  gsap.set(dlFill,  { opacity: 0, scale: 0, transformOrigin: '50% 50%' });
  gsap.set(dlCheck, { strokeDasharray: 22, strokeDashoffset: 22 });
  if (dlBar) gsap.set(dlBar, { scaleX: 0 });

  const tl = gsap.timeline({ paused: true, onComplete });

  tl.set(header,       { opacity: 0, y: 6 })
    .set(items,        { opacity: 0 })
    .set(activeIcons,  { opacity: 0 })
    .set(doneIcons,    { opacity: 0, scale: 0 })
    .set(pendingIcons, { opacity: 1 })
    .set(itemTexts,    { textDecoration: 'none', opacity: 0.45 })
    .set(dlWrap,       { opacity: 0, y: 8 })
    .set(dlCirc,       { strokeDashoffset: CIRC })
    .set(dlFill,       { opacity: 0, scale: 0 })
    .set(dlCheck,      { strokeDashoffset: 22 });
  if (dlBar) tl.set(dlBar, { scaleX: 0 });

  tl.to(header, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });
  tl.to(items,  { opacity: 1, duration: 0.25, stagger: 0.07 }, '+=0.1');

  STEPS.forEach((_, i) => {
    const activeMs = STEP_TIMING[i] / 1000;

    tl.set(pendingIcons[i], { opacity: 0 });
    tl.set(activeIcons[i],  { opacity: 1 });
    tl.set(itemTexts[i],    { opacity: 1 });
    tl.to({}, { duration: activeMs });
    tl.set(activeIcons[i],  { opacity: 0 });
    tl.to(doneIcons[i], {
      opacity: 1, scale: 1,
      duration: 0.25, ease: 'back.out(2.5)',
      transformOrigin: '50% 50%',
    });
    tl.set(itemTexts[i], { textDecoration: 'line-through', opacity: 0.4 });
    tl.call(() => { if (counter) counter.textContent = `${i + 1} / ${STEPS.length}`; });
    tl.to({}, { duration: 0.15 });
  });

  tl.to(dlWrap, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(2)' }, '+=0.2');
  tl.to(dlCirc, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.inOut' }, '+=0.15');
  tl.to(dlFill, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', transformOrigin: '50% 50%' });
  if (dlBar) tl.to(dlBar, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, '<');
  tl.to(dlCheck, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, '+=0.05');

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
      className="landing-step-illustration"
      style={{ gap: 8, position: 'relative', overflow: 'hidden', padding: '12px 14px 0' }}
      aria-hidden="true"
    >
      {/* Header */}
      <div className="s3-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4, opacity: 0,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
        }}>
          Generate pitch video
        </span>
        <span className="s3-counter" style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-mono)',
        }}>
          0 / {STEPS.length}
        </span>
      </div>

      {/* Checklist */}
      {STEPS.map((label, i) => (
        <div key={label} className="s3-item" style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '4px 0', opacity: 0,
          borderBottom: i < STEPS.length - 1 ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <div style={{ width: 18, height: 18, position: 'relative', flexShrink: 0 }}>
            <svg className="s3-icon-pending" width="18" height="18" viewBox="0 0 18 18" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--border-default)" strokeWidth="1.5" />
            </svg>
            <svg className="s3-icon-active" width="18" height="18" viewBox="0 0 18 18" style={{ position: 'absolute', inset: 0, opacity: 0 }}>
              <circle
                className="s3-spinner-ring"
                cx="9" cy="9" r="7.5"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="12 35"
              />
            </svg>
            <div className="s3-icon-done" style={{
              position: 'absolute', inset: 0,
              opacity: 0, transform: 'scale(0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="9" fill="var(--accent)" />
                <polyline
                  points="4.5,9 7.5,12 13.5,6"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <span className="s3-item-text" style={{
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-muted)',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}>
            {label}
          </span>
        </div>
      ))}

      {/* Download success */}
      <div className="s3-dl-wrap" style={{
        marginTop: 8, marginBottom: 0, opacity: 0,
        padding: '10px 12px',
        background: 'rgba(74,222,128,0.06)',
        border: '1px solid rgba(74,222,128,0.18)',
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 1 1 1 1 23 23 23 23 7" />
              <polyline points="16 1 16 7 23 7" />
              <line x1="12" y1="10" x2="12" y2="18" />
              <polyline points="9 15 12 18 15 15" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              render_v3.mp4
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              1080p · 48 MB
            </p>
          </div>
          <svg width="22" height="22" viewBox="0 0 30 30" style={{ flexShrink: 0 }}>
            <circle className="s3-dl-circ" cx="15" cy="15" r={13} fill="none" stroke="rgba(74,222,128,0.3)" strokeWidth="2" strokeLinecap="round" />
            <circle className="s3-dl-fill" cx="15" cy="15" r={13} fill="#4ADE80" stroke="#4ADE80" strokeWidth="2" opacity="0" />
            <polyline className="s3-dl-check" points="8,15 13,20 22,10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div style={{ height: 3, borderRadius: 99, background: 'rgba(74,222,128,0.15)', overflow: 'hidden' }}>
          <div className="s3-dl-bar" style={{
            height: '100%', width: '100%',
            background: 'linear-gradient(90deg, #4ADE80, #22c55e)',
            borderRadius: 99,
            transformOrigin: 'left center',
          }} />
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#4ADE80', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
          Ready to download
        </p>
      </div>
    </div>
  );
};
