import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const SETTINGS = [
  { label: 'Voice', value: 'Orus' },
  { label: 'Theme', value: 'Cinematic' },
];
const PROMPT_TEXT = 'Show the onboarding process and highlight key product features...';

interface Props {
  active: boolean;
  onComplete?: () => void;
}

export const Step2Illustration = ({ active, onComplete }: Props) => {
  const rootRef   = useRef<HTMLDivElement>(null);
  const typedRef  = useRef<HTMLSpanElement>(null);
  const tlRef     = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const settings = root.querySelector<HTMLElement>('.s2-settings');
    const inputBox  = root.querySelector<HTMLElement>('.s2-input-box');
    const cursor    = root.querySelector<HTMLElement>('.s2-cursor');
    const tags      = root.querySelectorAll<HTMLElement>('.s2-tag');
    const typed     = typedRef.current;

    if (!settings || !inputBox || !cursor || !tags.length || !typed) return;

    const tl = gsap.timeline({
      paused: true,
      onComplete: () => { if (onComplete) onComplete(); },
    });

    tlRef.current = tl;

    // Reset
    tl.set(settings, { opacity: 0, y: 6 })
      .set(inputBox,  { opacity: 0, y: 6 })
      .set(cursor,    { opacity: 0 })
      .set(tags,      { opacity: 0, y: 4, scale: 0.9 });
    tl.call(() => { if (typed) typed.textContent = ''; });

    // 1. Settings row
    tl.to(settings, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });

    // 2. Input box
    tl.to(inputBox, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, '+=0.1');

    // 3. Cursor blinks before typing
    tl.to(cursor, { opacity: 1, duration: 0.05 }, '+=0.15');
    tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 1, yoyo: true });
    tl.to(cursor, { opacity: 1, duration: 0.05 });

    // 4. Type chars one by one — cursor follows naturally
    const chars = [...PROMPT_TEXT];
    chars.forEach((ch, i) => {
      tl.call(() => {
        if (typed) typed.textContent = PROMPT_TEXT.slice(0, i + 1);
      }, [], `+=0.032`);
    });

    // 5. Cursor blinks at end
    tl.to(cursor, { opacity: 0, duration: 0.2, repeat: 3, yoyo: true }, '+=0.15');
    tl.to(cursor, { opacity: 1, duration: 0.05 });

    // 6. Tags appear
    tl.to(tags, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)', stagger: 0.07 }, '+=0.2');

    // Hold at final state — no fade out

    return () => { tl.kill(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active && tlRef.current) {
      tlRef.current.restart();
    }
  }, [active]);

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
          <span ref={typedRef} />
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
