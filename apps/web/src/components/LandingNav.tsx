import { useAuth } from '@clerk/react'
import { Link } from 'react-router-dom'
import tabLogoB from '../assets/tabLogoB.svg'
import tabLogoW from '../assets/tabLogoW.svg'
import { useTheme } from '../contexts/ThemeContext'

const NAV_LINKS = [
  { label: 'Work', to: '/#work' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'API / MCP', to: '/#api' },
]

const SunIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

const MoonIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)

export const LandingNav = () => {
  const { isSignedIn } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <>
      {/* Announcement bar */}
      <div className="landing-announcement" role="banner">
        <span>$5 in render credits when you sign up</span>
        <Link to="/sign-up" className="landing-announcement-cta">
          Claim
        </Link>
      </div>

      {/* Navbar */}
      <nav className="lb-nav" aria-label="Main navigation">
        <div className="lb-nav-in">
          <Link to="/" aria-label="Pitch home" className="lb-brand">
            <img
              src={theme === 'dark' ? tabLogoW : tabLogoB}
              alt=""
              className="lb-brand-mark"
              width={18}
              height={18}
            />
            Pitch
          </Link>

          <div className="lb-nav-r">
            {NAV_LINKS.map(link => (
              <Link key={link.label} to={link.to} className="lb-nav-link">
                {link.label}
              </Link>
            ))}

            <button
              type="button"
              className="lb-theme-toggle"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            <Link to={isSignedIn ? '/dashboard' : '/sign-up'} className="lb-cta">
              {isSignedIn ? 'Dashboard' : 'Start a cut'}
            </Link>
          </div>
        </div>
      </nav>
    </>
  )
}
