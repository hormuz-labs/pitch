import { useAuth } from '@clerk/clerk-react';
import { Link, useLocation } from 'react-router-dom';
import tabLogoB from '/tabLogoB.svg';

const NAV_LINKS: any[] = [];

export const LandingNav = () => {
  const { isSignedIn } = useAuth();
  const { pathname, hash } = useLocation();

  const isActive = (link: typeof NAV_LINKS[number]) =>
    link.match(pathname, hash);

  return (
    <>
      {/* Announcement bar */}
      <div className="landing-announcement" role="banner">
        <span>Get $5 worth of free credits when you sign up!</span>
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

          {/* Actions */}
          <div className="landing-nav-actions">
            {isSignedIn ? (
              <Link 
                to="/dashboard" 
                className="group flex items-center justify-center gap-1.5 bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 text-white transition-all duration-500 ease-out [background-size:200%_auto] [background-position:0%_center] hover:[background-position:99%_center] hover:shadow-xl shadow-black/20 border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-gray-900/50 focus:ring-offset-2" 
                style={{ borderRadius: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: '500', letterSpacing: '0.01em', textDecoration: 'none' }}
              >
                Dashboard
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            ) : (
              <Link 
                to="/sign-up" 
                className="group flex items-center justify-center gap-1.5 bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 text-white transition-all duration-500 ease-out [background-size:200%_auto] [background-position:0%_center] hover:[background-position:99%_center] hover:shadow-xl shadow-black/20 border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-gray-900/50 focus:ring-offset-2" 
                style={{ borderRadius: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: '500', letterSpacing: '0.01em', textDecoration: 'none' }}
              >
                Get Started
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};
