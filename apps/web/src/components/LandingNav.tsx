import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import tabLogoB from '/tabLogoB.svg';

const NAV_LINKS = [
  { label: 'Showcase', to: '/#showcase' },
  { label: 'Roadmap',  to: '/#roadmap'  },
  { label: 'Pricing',  to: '/pricing'   },
];

export const LandingNav = () => {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

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
            {NAV_LINKS.map(({ label, to }) => (
              <Link key={label} to={to} className="landing-nav-link" role="listitem">
                {label}
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
            {NAV_LINKS.map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                className="landing-nav-drawer-link"
                onClick={() => setOpen(false)}
              >
                {label}
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
