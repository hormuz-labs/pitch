import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import tabLogoB from '../../assets/tabLogoB.svg';
import tabLogoW from '../../assets/tabLogoW.svg';
import logoBlack from '../../assets/logoB.svg';
import logoWhite from '../../assets/logo.svg';
import { useTheme } from '../../contexts/ThemeContext';

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const LandingNav = () => {
  const { theme, toggle } = useTheme();
  const { isSignedIn } = useAuth();

  return (
    <>
      {/* Announcement bar */}
      <div className="landing-announcement" role="banner">
        <span>Welcome Offer: 80% off your first video — limited time</span>
        <Link to="/sign-up" className="landing-announcement-cta">Claim now</Link>
      </div>

      {/* Navbar */}
      <nav className="landing-nav" aria-label="Main navigation">
        <div className="landing-nav-inner">
          <Link to="/" aria-label="Pitch home" className="landing-nav-logo">
            <img src={theme === 'dark' ? tabLogoW : tabLogoB} alt="" aria-hidden="true" className="landing-nav-logo-img" />
            <img src={theme === 'dark' ? logoWhite : logoBlack} alt="PITCH" className="landing-nav-logo-wordmark" />
          </Link>

          <div className="landing-nav-links" role="list">
            {['Showcase', 'Roadmap', 'Pricing', 'Changelog'].map((label) => (
              <Link key={label} to="/pricing" className="landing-nav-link" role="listitem">
                {label}
              </Link>
            ))}
          </div>

          <div className="landing-nav-actions">
            <button
              className="landing-nav-theme-toggle"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            {isSignedIn ? (
              <Link to="/dashboard" className="landing-nav-cta">Dashboard</Link>
            ) : (
              <>
                <Link to="/sign-in" className="landing-nav-link">Sign in</Link>
                <Link to="/sign-up" className="landing-nav-cta">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};
