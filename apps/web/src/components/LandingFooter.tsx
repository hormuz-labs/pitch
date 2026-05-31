import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { PitchWordmark } from './PitchWordmark';

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
  {
    heading: 'Product',
    links: [
      { label: 'Pricing',      to: '/pricing' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Us', to: '/about' },
      { label: 'Blog',     to: '/blog' },
      { label: 'Contact',  to: 'mailto:support@trypitch.co' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
    ],
  },
];

export const LandingFooter = () => {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const RADIUS = 180;
    const STRENGTH = 0.5;

    const onMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RADIUS) {
        const t = 1 - dist / RADIUS;
        gsap.to(wrap, {
          x: dx * STRENGTH * t,
          y: dy * STRENGTH * t,
          // color drives currentColor on the SVG inside
          color: `rgba(255,255,255,${0.45 + t * 0.55})`,
          duration: 0.3,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      } else {
        gsap.to(wrap, {
          x: 0,
          y: 0,
          color: 'rgba(255,255,255,1)',
          duration: 0.7,
          ease: 'elastic.out(1,0.45)',
          overwrite: 'auto',
        });
      }
    };

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-top">

          {/* Brand column */}
          <div className="landing-footer-brand">
            {/*
              GSAP animates `color` on this wrapper.
              PitchWordmark uses fill="currentColor" so it inherits it.
              Initial color is dim; brightens as cursor approaches.
            */}
            <div
              ref={wrapRef}
              className="landing-footer-wordmark"
              aria-label="Pitch"
              style={{ color: 'rgba(255,255,255,1)' }}
            >
              <PitchWordmark />
            </div>

            <p className="landing-footer-tagline">
              The AI agent that turns your product URL into a cinematic pitch video in minutes.
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
                  {links.map(({ label, to }) => (
                    <li key={label}>
                      {to.startsWith('mailto:')
                        ? <a href={to} className="landing-footer-nav-link">{label}</a>
                        : <Link to={to} className="landing-footer-nav-link">{label}</Link>
                      }
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
