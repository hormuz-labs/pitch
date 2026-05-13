import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface StepCardProps {
  numeral: string;
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export const StepCard = ({ numeral, step, title, description, children }: StepCardProps) => {
  const cardRef  = useRef<HTMLDivElement>(null);
  const spotRef  = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card  = cardRef.current;
    const spot  = spotRef.current;
    const trail = trailRef.current;
    if (!card || !spot || !trail) return;

    const cur    = { x: 0, y: 0 };
    const lag    = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let raf      = 0;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let glowRgb = '60,60,60';

    const tick = () => {
      cur.x = lerp(cur.x, target.x, 0.9);
      cur.y = lerp(cur.y, target.y, 0.9);
      lag.x = lerp(lag.x, target.x, 0.18);
      lag.y = lerp(lag.y, target.y, 0.18);

      const c = glowRgb;

      gsap.set(spot, {
        background: `radial-gradient(circle at ${cur.x}px ${cur.y}px,
          rgba(${c},0.55) 0%,
          rgba(${c},0.20) 8%,
          transparent 15%)`,
      });
      gsap.set(trail, {
        background: `radial-gradient(circle at ${lag.x}px ${lag.y}px,
          rgba(${c},0.30) 0%,
          rgba(${c},0.10) 10%,
          transparent 18%)`,
      });

      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      const r  = card.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
    };

    const onEnter = () => {
      glowRgb = getComputedStyle(card).getPropertyValue('--card-glow-rgb').trim() || '60,60,60';
      gsap.to([spot, trail], { opacity: 1, duration: 0.5, ease: 'power2.out' });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      gsap.to([spot, trail], { opacity: 0, duration: 0.8, ease: 'power2.inOut' });
      cancelAnimationFrame(raf);
    };

    card.addEventListener('mouseenter', onEnter);
    card.addEventListener('mousemove',  onMove);
    card.addEventListener('mouseleave', onLeave);

    return () => {
      card.removeEventListener('mouseenter', onEnter);
      card.removeEventListener('mousemove',  onMove);
      card.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={cardRef} className="landing-step-card">
      <div ref={spotRef}  aria-hidden="true" className="landing-step-card-glow landing-step-card-glow--spot" />
      <div ref={trailRef} aria-hidden="true" className="landing-step-card-glow landing-step-card-glow--trail" />

      <div className="landing-step-card-header">
        <span className="landing-step-numeral" aria-hidden="true">{numeral}</span>
        <span className="landing-step-label">{step}</span>
      </div>
      <div className="landing-step-body">
        <div className="landing-step-illustration">{children}</div>
        <div>
          <h3 className="landing-step-title">{title}</h3>
          <p className="landing-step-desc">{description}</p>
        </div>
      </div>
    </div>
  );
};
