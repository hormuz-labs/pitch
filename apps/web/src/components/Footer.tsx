import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { PitchWordmark } from './PitchWordmark';
import { useTheme } from '../contexts/ThemeContext';

const SOCIAL_LINKS = [
  {
    label: 'X (Twitter)',
    href: 'https://x.com/trypitchdotco',
    d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/trypitchdotco/',
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
];

const NAV_COLS: { heading: string; links: { label: string; to: string }[] }[] = [
  { heading: 'Product', links: [{ label: 'How It Works', to: '/pricing' }, { label: 'Pricing', to: '/pricing' }, { label: 'Examples', to: '/pricing' }, { label: 'Changelog', to: '/pricing' }] },
  { heading: 'Company', links: [{ label: 'Blog', to: '/pricing' }, { label: 'Careers', to: '/pricing' }, { label: 'Contact', to: '/pricing' }] },
  { heading: 'Legal', links: [{ label: 'Privacy Policy', to: '/privacy' }, { label: 'Terms of Service', to: '/terms' }] },
];

export const Footer = () => {
  const footerRef = useRef<HTMLElement>(null);
  const spotRef   = useRef<HTMLDivElement>(null);
  const trailRef  = useRef<HTMLDivElement>(null);
  const { } = useTheme();

  useEffect(() => {
    const footer = footerRef.current;
    const spot   = spotRef.current;
    const trail  = trailRef.current;
    if (!footer || !spot || !trail) return;

    const cur    = { x: 0, y: 0 };
    const lag    = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let raf      = 0;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const isDark = () => document.documentElement.dataset.theme === 'dark';

    const tick = () => {
      cur.x = lerp(cur.x, target.x, 0.9);
      cur.y = lerp(cur.y, target.y, 0.9);
      lag.x = lerp(lag.x, target.x, 0.18);
      lag.y = lerp(lag.y, target.y, 0.18);

      const c = isDark() ? '255,255,255' : '60,60,60';

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
      const r  = footer.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
    };

    const onEnter = () => {
      gsap.to([spot, trail], { opacity: 1, duration: 0.5, ease: 'power2.out' });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      gsap.to([spot, trail], { opacity: 0, duration: 0.8, ease: 'power2.inOut' });
      cancelAnimationFrame(raf);
    };

    footer.addEventListener('mouseenter', onEnter);
    footer.addEventListener('mousemove',  onMove);
    footer.addEventListener('mouseleave', onLeave);

    return () => {
      footer.removeEventListener('mouseenter', onEnter);
      footer.removeEventListener('mousemove',  onMove);
      footer.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <footer ref={footerRef} className="landing-footer">

      <div ref={spotRef}  aria-hidden="true" className="landing-footer-glow landing-footer-glow--spot" />
      <div ref={trailRef} aria-hidden="true" className="landing-footer-glow landing-footer-glow--trail" />

      <div className="landing-footer-inner">
        <div className="landing-footer-top">

          {/* Brand column */}
          <div className="landing-footer-brand">
            <div className="landing-footer-wordmark" aria-label="Pitch">
              <PitchWordmark />
            </div>

            <p className="landing-footer-tagline">
              The AI agent that turns your product URL into a cinematic{' '}
              <span style={{ fontStyle: 'italic', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 500 }}>pitch</span>
              {' '}video in minutes.
            </p>

            <div className="landing-footer-socials">
              {SOCIAL_LINKS.map(({ label, href, d }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="landing-footer-social"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d={d} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          <nav className="landing-footer-nav" aria-label="Footer navigation">
            {NAV_COLS.map(({ heading, links }) => (
              <div key={heading} className="landing-footer-nav-col">
                <p className="landing-footer-nav-heading">{heading}</p>
                <ul className="landing-footer-nav-list">
                  {links.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="landing-footer-nav-link">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="landing-footer-bottom">
          <p className="landing-footer-copy">© {new Date().getFullYear()} Pitch. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
