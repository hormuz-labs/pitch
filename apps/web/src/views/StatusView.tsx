/**
 * One page for every dead end: a missing route, and the app failing to reach
 * its own backend. Both used to surface as either a blank screen or
 * Cloudflare's default tunnel error, which is the last thing a visitor should
 * see on a product that sells polish.
 *
 * The Cloudflare edge page itself cannot be rendered from here — when the
 * tunnel is down the request never reaches this app. public/edge-error.html is
 * the standalone twin of this page for Cloudflare's Custom Error Pages.
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PitchAsciiMark } from '../components/PitchAsciiMark'
import { Seo } from '../components/Seo'
import '../styles/status.css'

/**
 * The SPA rewrite means these pages answer with HTTP 200, so a crawler has no
 * status code to go on. noindex keeps soft 404s out of the index; it is removed
 * on unmount so a client-side navigation to a real page is indexable again.
 */
function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex'
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [])
}

export type StatusVariant = 'not-found' | 'offline'

interface Props {
  variant?: StatusVariant
  /** Offline only: re-run the health probe. */
  onRetry?: () => void
  /** Offline only: a probe is in flight. */
  retrying?: boolean
}

const COPY: Record<
  StatusVariant,
  { code: string; eyebrow: string; title: React.ReactNode; body: string; seo: string }
> = {
  'not-found': {
    code: '404',
    eyebrow: 'Error 404 · Page not found',
    title: (
      <>
        This one never made <em>the cut</em>.
      </>
    ),
    body: 'The page you asked for does not exist, or it moved. Nothing is broken on our side — the link just points nowhere.',
    seo: 'Page not found',
  },
  offline: {
    code: '503',
    eyebrow: 'Error 503 · Service unreachable',
    title: (
      <>
        The studio is <em>off the air</em>.
      </>
    ),
    body: 'We cannot reach the Pitch backend right now. Your projects and renders are safe — this is a connection problem, not a data one. The page retries on its own.',
    seo: 'Service unavailable',
  },
}

export const StatusView = ({ variant = 'not-found', onRetry, retrying = false }: Props) => {
  const copy = COPY[variant]
  useNoIndex()

  return (
    <div className="status-root" data-variant={variant}>
      <Seo
        title={`Pitch — ${copy.seo}`}
        description={copy.body}
        path={variant === 'not-found' ? '/404' : '/503'}
      />

      <div className="status-watermark" aria-hidden="true">
        {copy.code}
      </div>

      <PitchAsciiMark size={260} className="status-mark" />

      <div className="status-copy">
        <p className="status-eyebrow">{copy.eyebrow}</p>
        <h1 className="status-title">{copy.title}</h1>
        <p className="status-body">{copy.body}</p>

        <div className="status-actions">
          {variant === 'offline' ? (
            <>
              <button type="button" className="status-cta" onClick={onRetry} disabled={retrying}>
                {retrying ? 'Reconnecting…' : 'Try again'}
              </button>
              <a
                className="status-ghost"
                href="mailto:support@trypitch.co?subject=Pitch%20is%20unreachable"
              >
                Contact support
              </a>
            </>
          ) : (
            <>
              <Link className="status-cta" to="/">
                Back to home
              </Link>
              <Link className="status-ghost" to="/blog">
                Read the blog
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="status-detail">
        <span>
          Status <b>{copy.code}</b>
        </span>
        <span>
          Path <b>{typeof window === 'undefined' ? '/' : window.location.pathname}</b>
        </span>
      </div>

      <nav className="status-links">
        <Link to="/">Home</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/blog">Blog</Link>
        <a href="/docs">Docs</a>
        <a href="mailto:support@trypitch.co">Support</a>
      </nav>
    </div>
  )
}

export const NotFoundView = () => <StatusView variant="not-found" />
