import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { PitchWordmark } from './PitchWordmark';
import { useTheme } from '../contexts/ThemeContext';

const SOCIAL_LINKS = [
  {
    label: 'X (Twitter)',
    href: '#',
    d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'GitHub',
    href: '#',
    d: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/trypitchdotco/',
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
];

const NAV_COLS = [
  { heading: 'Product', links: ['How It Works', 'Pricing', 'Examples', 'Changelog'] },
  { heading: 'Company', links: ['Blog', 'Careers', 'Contact'] },
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
                    <li key={item}>
                      <Link to="/pricing" className="landing-footer-nav-link">{item}</Link>
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
          <div className="landing-footer-legal">
            <Link to="/privacy" className="landing-footer-legal-link">Privacy Policy</Link>
            <a href="#" className="landing-footer-legal-link">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
