import gsap from 'gsap';
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline';

const SETTINGS = [
  { label: 'Voice', value: 'Orus' },
  { label: 'Theme', value: 'Cinematic' },
];
const PROMPT_TEXT = 'Show the onboarding process and highlight key product features...';

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const settings = root.querySelector<HTMLElement>('.s2-settings');
  const inputBox  = root.querySelector<HTMLElement>('.s2-input-box');
  const cursor    = root.querySelector<HTMLElement>('.s2-cursor');
  const tags      = root.querySelectorAll<HTMLElement>('.s2-tag');
  const typed     = root.querySelector<HTMLSpanElement>('.s2-typed');

  if (!settings || !inputBox || !cursor || !tags.length || !typed) {
    return gsap.timeline({ paused: true });
  }

  const tl = gsap.timeline({ paused: true, onComplete });

  tl.set(settings, { opacity: 0, y: 6 })
    .set(inputBox,  { opacity: 0, y: 6 })
    .set(cursor,    { opacity: 0 })
    .set(tags,      { opacity: 0, y: 4, scale: 0.9 });
  tl.call(() => { typed.textContent = ''; });

  tl.to(settings, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });
  tl.to(inputBox, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, '+=0.1');
  tl.to(cursor, { opacity: 1, duration: 0.05 }, '+=0.15');
  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 1, yoyo: true });
  tl.to(cursor, { opacity: 1, duration: 0.05 });

  const chars = [...PROMPT_TEXT];
  chars.forEach((_, i) => {
    tl.call(() => { typed.textContent = PROMPT_TEXT.slice(0, i + 1); }, [], '+=0.032');
  });

  tl.to(cursor, { opacity: 0, duration: 0.2, repeat: 3, yoyo: true }, '+=0.15');
  tl.to(cursor, { opacity: 1, duration: 0.05 });
  tl.to(tags, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)', stagger: 0.07 }, '+=0.2');

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
      className="landing-step-illustration"
      style={{ gap: 10, position: 'relative', overflow: 'hidden' }}
      aria-hidden="true"
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -10, right: -10,
        width: 140, height: 100,
        background: 'radial-gradient(ellipse, rgba(255,90,31,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Settings chips row */}
      <div className="s2-settings" style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', opacity: 0,
      }}>
        {SETTINGS.map(({ label, value }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 99,
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
              {label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Prompt input */}
      <div className="s2-input-box" style={{
        flex: 1,
        padding: '10px 12px',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        minHeight: 70,
        position: 'relative',
        opacity: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 12, lineHeight: 1.6,
          fontFamily: 'var(--font-sans)', color: 'var(--text-muted)',
          wordBreak: 'break-word', overflowWrap: 'break-word',
        }}>
          <span className="s2-typed" />
          <span className="s2-cursor" style={{
            display: 'inline-block', width: 1.5, height: 12,
            background: 'var(--accent)', borderRadius: 1, marginLeft: 1,
            verticalAlign: 'text-bottom', opacity: 0,
          }} />
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['#onboarding', '#features', '#product'].map(tag => (
          <span key={tag} className="s2-tag" style={{
            opacity: 0,
            padding: '3px 9px',
            background: 'var(--accent-subtle)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 99,
            fontSize: 10, fontWeight: 600,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};
