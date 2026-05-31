import { Link } from 'react-router-dom';
import { PitchWordmark } from './PitchWordmark';
import { FaXTwitter, FaLinkedinIn } from 'react-icons/fa6';

const SOCIAL_LINKS = [
  {
    label: 'X (Twitter)',
    href: 'https://x.com/trypitchdotco',
    icon: FaXTwitter,
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/trypitchdotco/',
    icon: FaLinkedinIn,
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
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-top">

          {/* Brand column */}
          <div className="landing-footer-brand">
            <div
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
              {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="landing-footer-social"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon size={16} />
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
