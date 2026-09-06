import { useAuth } from '@clerk/react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import tabLogoB from '../assets/tabLogoB.svg'
import { SOCIALS } from './LandingFooter'
import { McpModal } from './landing/McpModal'
import { PRODUCTS, ProductGlyph } from './landing/productCatalog'
import { PitchLogoAnimation } from './PitchLogoAnimation'
// The nav owns its stylesheet rather than trusting the host page to have
// imported it. /blog, /about, /privacy and /terms all render this component
// without importing any landing CSS, which left the bar completely unstyled.
import '../styles/landing.css'
import '../styles/landing-broadcast.css'

/**
 * "Product" mega-menu — opens on hover / focus / tap. While open the page
 * behind it is blurred by a scrim that starts *below* the navbar, so the nav
 * itself stays crisp and in focus.
 */
const ProductMenu = () => {
  const [open, setOpen] = useState(false)
  const [scrimTop, setScrimTop] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 90)
  }

  useEffect(() => cancelClose, [])

  // Keep the blur scrim pinned to the bottom edge of the navbar.
  useEffect(() => {
    if (!open) return
    const measure = () => {
      const nav = wrapRef.current?.closest('nav')
      setScrimTop(nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0)
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  // Close on Escape, and on any click outside the menu.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <>
      <div
        ref={wrapRef}
        className="lb-nav-mega"
        data-open={open || undefined}
        onMouseEnter={() => {
          cancelClose()
          setOpen(true)
        }}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          className="lb-nav-link"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(v => !v)}
          onFocus={() => {
            cancelClose()
            setOpen(true)
          }}
        >
          Product
          <ChevronDown className="lb-nav-caret" size={13} strokeWidth={2} aria-hidden />
        </button>

        <div id={panelId} className="lb-mega-panel" role="menu" aria-label="Product">
          <p className="lb-mega-head">What you can make</p>
          <div className="lb-mega-grid">
            {PRODUCTS.map(p => (
              <Link
                key={p.slug}
                to={`/product/${p.slug}`}
                role="menuitem"
                className="lb-mega-item"
                onClick={() => setOpen(false)}
              >
                <span className="lb-mega-ico">
                  <ProductGlyph icon={p.icon} size={15} />
                </span>
                <span className="lb-mega-copy">
                  <span className="lb-mega-name">
                    {p.name}
                    {p.badge && <span className="lb-mega-badge">{p.badge}</span>}
                  </span>
                  <span className="lb-mega-desc">{p.nav}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="lb-mega-foot">
            <span>One agent. Idea to finished cut.</span>
            <Link to="/#work" onClick={() => setOpen(false)}>
              See the work
            </Link>
          </div>
        </div>
      </div>

      {/* Portalled to <body> so its backdrop-filter samples the page, not the
          navbar's own compositing layer. `top` keeps the nav itself unblurred. */}
      {createPortal(
        <div
          className="lb-mega-scrim"
          data-open={open || undefined}
          style={{ top: scrimTop }}
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />,
        document.body,
      )}
    </>
  )
}

export const LandingNav = () => {
  const { isSignedIn } = useAuth()
  const [mcpOpen, setMcpOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileMenuId = useId()
  const mobileButtonRef = useRef<HTMLButtonElement>(null)

  // The pitch is public now, so the nav points everyone at it; its own CTA is
  // what routes you on to the dashboard or to sign-up.
  const affiliatesHref = '/affiliates'

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      mobileButtonRef.current?.focus()
    }
    const onResize = () => {
      if (window.innerWidth > 880) setMobileOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [mobileOpen])

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      {/* Announcement bar */}
      <div className="landing-announcement lb-chrome" role="banner">
        <span>$5 in render credits when you sign up</span>
        <Link to="/sign-up" className="landing-announcement-cta">
          Claim
        </Link>
      </div>

      {/* Navbar */}
      <nav
        className="lb-nav lb-chrome"
        aria-label="Main navigation"
        data-mobile-open={mobileOpen || undefined}
      >
        <div className="lb-nav-in">
          <Link to="/" aria-label="Pitch home" className="lb-brand">
            <img src={tabLogoB} alt="" className="lb-brand-mark" width={32} height={32} />
            <span className="lb-brand-word">
              {/* static: the hero owns the animated wordmark, the nav is a mark */}
              <PitchLogoAnimation startAnimation={false} loop={false} color="currentColor" />
              <span className="lb-brand-by">A Frontier Agent</span>
            </span>
          </Link>

          <div className="lb-nav-center">
            <ProductMenu />
            <Link to="/pricing" className="lb-nav-link">
              Pricing
            </Link>
            <Link to={affiliatesHref} className="lb-nav-link">
              Affiliates
            </Link>
            <button type="button" className="lb-nav-link" onClick={() => setMcpOpen(true)}>
              API / MCP
            </button>
            <Link to="/docs" className="lb-nav-link">
              Docs
            </Link>
          </div>

          <div className="lb-nav-r">
            <div className="lb-nav-social">
              {SOCIALS.map(s => {
                const Icon = s.icon
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={s.label}
                  >
                    {Icon ? <Icon size={17} /> : s.label}
                  </a>
                )
              })}
            </div>

            {/* Theme toggle intentionally hidden while the site is light-only. */}

            <Link to={isSignedIn ? '/new' : '/sign-up'} className="lb-cta" onClick={closeMobile}>
              {isSignedIn ? 'Dashboard' : 'Get started'}
            </Link>

            <button
              ref={mobileButtonRef}
              type="button"
              className="lb-mobile-toggle"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
              aria-controls={mobileMenuId}
              onClick={() => setMobileOpen(open => !open)}
            >
              {mobileOpen ? <X size={16} aria-hidden /> : <Menu size={17} aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id={mobileMenuId} className="lb-mobile-menu" aria-label="Mobile navigation">
            <p className="lb-mobile-menu-label">Product</p>
            <div className="lb-mobile-products">
              {PRODUCTS.map(product => (
                <Link
                  key={product.slug}
                  to={`/product/${product.slug}`}
                  className="lb-mobile-product"
                  onClick={closeMobile}
                >
                  <span className="lb-mobile-product-icon">
                    <ProductGlyph icon={product.icon} size={15} />
                  </span>
                  <span>{product.name}</span>
                </Link>
              ))}
            </div>

            <div className="lb-mobile-links">
              <Link to="/pricing" onClick={closeMobile}>
                Pricing
              </Link>
              <Link to={affiliatesHref} onClick={closeMobile}>
                Affiliates
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobile()
                  setMcpOpen(true)
                }}
              >
                API / MCP
              </button>
              <Link to="/docs" onClick={closeMobile}>
                Docs
              </Link>
            </div>

            {/* Mobile theme control intentionally hidden while the site is light-only. */}

            <div className="lb-mobile-socials">
              <span>Follow</span>
              <div>
                {SOCIALS.map(social => {
                  const Icon = social.icon
                  return (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={social.label}
                      onClick={closeMobile}
                    >
                      {Icon ? <Icon size={17} /> : social.label}
                    </a>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </nav>

      {createPortal(
        <button
          type="button"
          className="lb-mobile-scrim"
          data-open={mobileOpen || undefined}
          aria-label="Close navigation menu"
          aria-hidden={!mobileOpen}
          tabIndex={mobileOpen ? 0 : -1}
          onClick={closeMobile}
        />,
        document.body,
      )}

      <McpModal open={mcpOpen} onClose={() => setMcpOpen(false)} />
    </>
  )
}
