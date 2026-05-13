import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import tabLogoW from '../../assets/tabLogoW.svg';

export const LandingNav = () => {
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
            <img src={tabLogoW} alt="Pitch" className="landing-nav-logo-img" />
          </Link>

          <div className="landing-nav-links" role="list">
            {['Showcase', 'Roadmap', 'Pricing', 'Changelog'].map((label) => (
              <Link key={label} to="/pricing" className="landing-nav-link" role="listitem">
                {label}
              </Link>
            ))}
          </div>

          <div className="landing-nav-actions">
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
