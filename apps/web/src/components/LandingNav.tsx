import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link, useLocation } from 'react-router-dom';
import tabLogoB from '/tabLogoB.svg';

const NAV_LINKS = [
  { label: 'Showcase', to: '/#showcase', match: (p: string, h: string) => p === '/' && h === '#showcase' },
  { label: 'Roadmap',  to: '/#roadmap',  match: (p: string, h: string) => p === '/' && h === '#roadmap'  },
  { label: 'Pricing',  to: '/pricing',   match: (p: string)            => p === '/pricing'               },
];

export const LandingNav = () => {
  const { isSignedIn } = useAuth();
  const [open, setOpen]   = useState(false);
  const { pathname, hash } = useLocation();

  const isActive = (link: typeof NAV_LINKS[number]) =>
    link.match(pathname, hash);

  return (
    <>
      {/* Announcement bar */}
      <div className="landing-announcement" role="banner">
        <span>Welcome offer: 80% off your first video</span>
        <Link to="/sign-up" className="landing-announcement-cta">Claim now</Link>
      </div>

      {/* Navbar */}
      <nav className="landing-nav" aria-label="Main navigation">
        <div className="landing-nav-inner">

          {/* Logo */}
          <Link to="/" aria-label="Pitch home" className="landing-nav-logo">
            <img src={tabLogoB} alt="Pitch" className="landing-nav-logo-img" />
          </Link>

          {/* Desktop links */}
          <div className="landing-nav-links" role="list">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                role="listitem"
                className={`landing-nav-link${isActive(link) ? ' landing-nav-link--active' : ''}`}
              >
                {isActive(link) && <span className="landing-nav-link-dot" aria-hidden="true" />}
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop actions */}
          <div className="landing-nav-actions landing-nav-actions--desktop">
            {isSignedIn ? (
              <Link to="/dashboard" className="landing-nav-cta">Dashboard</Link>
            ) : (
              <>
                <Link to="/sign-in" className="landing-nav-link">Sign in</Link>
                <Link to="/sign-up" className="landing-nav-cta">Get started</Link>
              </>
            )}
          </div>

          {/* Hamburger */}
          <button
            className={`landing-nav-hamburger${open ? ' is-open' : ''}`}
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`landing-nav-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="landing-nav-drawer-inner">
          <nav className="landing-nav-drawer-links">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className={`landing-nav-drawer-link${isActive(link) ? ' is-active' : ''}`}
                onClick={() => setOpen(false)}
              >
                {isActive(link) && <span className="landing-nav-link-dot" aria-hidden="true" />}
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="landing-nav-drawer-actions">
            {isSignedIn ? (
              <Link to="/dashboard" className="landing-nav-cta landing-nav-cta--full" onClick={() => setOpen(false)}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/sign-in" className="landing-nav-cta landing-nav-cta--ghost landing-nav-cta--full" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
                <Link to="/sign-up" className="landing-nav-cta landing-nav-cta--full" onClick={() => setOpen(false)}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
