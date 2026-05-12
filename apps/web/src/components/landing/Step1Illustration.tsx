import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const URL_CHARS = [...'www.trypitch.co'];
const DOTS = ['#FF5F56', '#FFBD2E', '#27C93F'];

interface Props {
  active: boolean;
  onComplete?: () => void;
}

export const Step1Illustration = ({ active, onComplete }: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const bar       = root.querySelector<HTMLElement>('.s1-bar');
    const chars     = root.querySelectorAll<HTMLElement>('.s1-char');
    const cursor    = root.querySelector<HTMLElement>('.s1-cursor');
    const loader    = root.querySelector<HTMLElement>('.s1-loader');
    const doneWrap  = root.querySelector<HTMLElement>('.s1-done-wrap');
    const doneCirc  = root.querySelector<SVGCircleElement>('.s1-done-circ');
    const doneCheck = root.querySelector<SVGPolylineElement>('.s1-done-check');
    const status    = root.querySelector<HTMLElement>('.s1-status');
    const skeleton  = root.querySelector<HTMLElement>('.s1-skeleton');
    if (!bar || !chars.length || !cursor || !loader || !doneWrap || !doneCirc || !doneCheck || !status) return;

    const CIRC_R = 7;
    const CIRC_C = 2 * Math.PI * CIRC_R;

    gsap.set(doneCirc, { strokeDasharray: CIRC_C, strokeDashoffset: CIRC_C });
    gsap.set(doneCheck, { strokeDasharray: 16, strokeDashoffset: 16 });

    const tl = gsap.timeline({
      paused: true,
      onComplete: () => { if (onComplete) onComplete(); },
    });

    tlRef.current = tl;

    // Reset
    tl.set(bar,      { opacity: 0, y: 8 })
      .set(chars,    { opacity: 0 })
      .set(cursor,   { opacity: 0 })
      .set(loader,   { opacity: 0 })
      .set(doneWrap, { opacity: 0, scale: 0 })
      .set(doneCirc, { strokeDashoffset: CIRC_C })
      .set(doneCheck,{ strokeDashoffset: 16 })
      .set(status,   { opacity: 0, y: 4 });
    if (skeleton) tl.set(skeleton, { opacity: 0 });

    // 1. Bar slides in
    tl.to(bar, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });

    // 2. URL types in char by char
    tl.to(chars, { opacity: 1, duration: 0.01, stagger: 0.055, ease: 'none' }, '+=0.15');

    // 3. Cursor blinks briefly
    tl.to(cursor, { opacity: 1, duration: 0.05 }, '>-=0.05');
    tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 2, yoyo: true });

    // 4. Loader appears
    tl.to(loader, { opacity: 1, duration: 0.2 }, '+=0.1');

    // 5. Loader out → done circle draws in
    tl.to(loader, { opacity: 0, duration: 0.15 }, '+=0.85');
    tl.to(doneWrap, { opacity: 1, scale: 1.15, duration: 0.15, ease: 'back.out(2)' });
    tl.to(doneWrap, { scale: 1, duration: 0.15, ease: 'power2.out' });
    tl.to(doneCirc, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.inOut' }, '<');
    tl.to(doneCheck, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' }, '+=0.05');

    // 6. Status line + skeleton
    tl.to(status, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '+=0.1');
    if (skeleton) tl.to(skeleton, { opacity: 1, duration: 0.3, ease: 'power2.out' }, '<');

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
      <style>{`
        @keyframes s1-dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
        .s1-dot-anim { animation: s1-dot-pulse 1.2s ease-in-out infinite; }
        .s1-dot-anim:nth-child(2) { animation-delay: 0.2s; }
        .s1-dot-anim:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
        width: 180, height: 80,
        background: 'radial-gradient(ellipse, rgba(74,222,128,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Browser bar */}
      <div className="s1-bar landing-step-browser-bar" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {DOTS.map(c => (
            <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
          ))}
        </div>

        {/* URL input area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, overflow: 'hidden' }}>
          {URL_CHARS.map((ch, i) => (
            <span
              key={i}
              className="s1-char"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'pre', opacity: 0 }}
            >
              {ch}
            </span>
          ))}
          <span className="s1-cursor" style={{
            display: 'inline-block', width: 1.5, height: 11,
            background: 'var(--text-muted)', borderRadius: 1, marginLeft: 1, opacity: 0,
          }} />
        </div>

        {/* Loader dots */}
        <div className="s1-loader" style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="s1-dot-anim" style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--text-faint)',
            }} />
          ))}
        </div>

        {/* Done checkmark circle */}
        <div className="s1-done-wrap" style={{ flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle
              className="s1-done-circ"
              cx="8" cy="8" r="7"
              fill="none"
              stroke="#4ADE80"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <polyline
              className="s1-done-check"
              points="4.5,8 7,10.5 11.5,5.5"
              fill="none"
              stroke="#4ADE80"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Status line */}
      <div className="s1-status" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontFamily: 'var(--font-sans)',
        color: '#4ADE80', opacity: 0,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', flexShrink: 0 }} />
        Site reachable · 42ms
      </div>

      {/* Mini landing page preview */}
      <div className="s1-skeleton" style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 2, opacity: 0, overflow: 'hidden', borderRadius: 6 }}>
        {/* Mini nav */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 10, height: 10, background: 'var(--text-primary)', borderRadius: 2 }} />
            <span style={{ fontSize: 7, fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', letterSpacing: '0.06em' }}>PITCH</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Showcase', 'Pricing'].map(l => (
              <span key={l} style={{ fontSize: 6, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>{l}</span>
            ))}
          </div>
          <div style={{ width: 28, height: 8, background: 'var(--text-primary)', borderRadius: 99 }} />
        </div>

        {/* Mini hero */}
        <div style={{
          padding: '8px 10px 6px',
          background: 'var(--bg-page)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 900, fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 2 }}>PITCH</div>
            <div style={{ fontSize: 8, fontStyle: 'italic', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1 }}>incredible.</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ padding: '2px 6px', background: 'var(--text-primary)', borderRadius: 99, fontSize: 5, color: 'var(--bg-page)', fontFamily: 'var(--font-sans)', fontWeight: 600, whiteSpace: 'nowrap' }}>Generate a demo</div>
              <div style={{ padding: '2px 6px', border: '1px solid var(--border-default)', borderRadius: 99, fontSize: 5, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>Watch a sample</div>
            </div>
          </div>
          {/* Mini mockup */}
          <div style={{
            width: 68, height: 46, borderRadius: 5,
            background: '#1E1E1E',
            border: '1px solid #3D3D3D',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ height: 7, background: '#2D2D2D', borderBottom: '1px solid #3D3D3D', display: 'flex', alignItems: 'center', paddingLeft: 4, gap: 2 }}>
              {['#FF5F56','#FFBD2E','#27C93F'].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: c }} />)}
            </div>
            <div style={{ flex: 1, padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ height: 3, background: '#3D3D3D', borderRadius: 2, width: '80%' }} />
              <div style={{ height: 3, background: '#3D3D3D', borderRadius: 2, width: '60%' }} />
              <div style={{ height: 3, background: '#22c55e', borderRadius: 2, width: '45%', opacity: 0.7 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
