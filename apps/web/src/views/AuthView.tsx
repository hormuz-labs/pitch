import { useSignIn, useSignUp } from '@clerk/react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import pitchWordmark from '../assets/logoB.svg'
import logoTab from '../assets/logoTab.png'
import pitchAsciiAnimationUrl from '../assets/pitch-ascii-animation.html?url'
import { safeRedirect } from '../lib/redirect'
import '../styles/auth.css'

const CALLBACK_URL = `${window.location.origin}/sso-callback`

const GoogleIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
)

interface Props {
  mode?: 'sign-in' | 'sign-up'
}

export const AuthView = ({ mode = 'sign-in' }: Props) => {
  const [tab, setTab] = useState<'sign-in' | 'sign-up'>(mode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => setTab(mode), [mode])

  // Where to land after auth. `?redirect=` carries the page the visitor was
  // actually trying to reach (set by the signed-out catch-all in App.tsx and by
  // the landing CTAs). Only same-site paths are accepted: a value starting with
  // `//` or a scheme would hand an open redirect to anyone who can craft a link.
  const redirectTo = safeRedirect(new URLSearchParams(location.search).get('redirect'))

  const oauth = async () => {
    setLoading(true)
    setError('')
    try {
      const handler = tab === 'sign-in' ? signIn : signUp
      const result = await handler?.sso({
        strategy: 'oauth_google',
        redirectUrl: redirectTo,
        redirectCallbackUrl: CALLBACK_URL,
      })
      if (result?.error) {
        console.error(result.error)
        setError('We couldn’t connect to Google. Please try again.')
        setLoading(false)
      }
    } catch (oauthError) {
      console.error(oauthError)
      setError('We couldn’t connect to Google. Please try again.')
      setLoading(false)
    }
  }

  // Keep ?redirect= when toggling between sign-in and sign-up, so switching
  // tabs does not quietly lose where the visitor was headed.
  const switchMode = (next: 'sign-in' | 'sign-up') => navigate(`/${next}${location.search}`)

  return (
    <main className="auth-page">
      <section className="auth-showcase" aria-label="Pitch product preview">
        <div className="auth-art">
          <iframe
            src={pitchAsciiAnimationUrl}
            title="Animated Pitch logo"
            className="auth-ascii-animation"
          />
        </div>
      </section>

      <section className="auth-form-side">
        <a href="/" className="auth-mobile-brand" aria-label="Pitch home">
          <img src={pitchWordmark} alt="Pitch" />
        </a>
        <div className="auth-form-wrap">
          <a href="/" className="auth-form-brand" aria-label="Pitch home">
            <img src={pitchWordmark} alt="Pitch" />
          </a>
          <div className="auth-heading">
            <h2>{tab === 'sign-up' ? 'Create your account' : 'Sign in to Pitch'}</h2>
            <p>
              {tab === 'sign-up'
                ? 'Start creating your first standout pitch.'
                : 'Continue creating something remarkable.'}
            </p>
          </div>
          <button
            className="auth-google-btn"
            onClick={oauth}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? <span className="auth-spinner" /> : <GoogleIcon />}
            <span>
              {loading
                ? 'Connecting to Google…'
                : `${tab === 'sign-up' ? 'Sign up' : 'Continue'} with Google`}
            </span>
          </button>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <div id="clerk-captcha" />
          <p className="auth-switch">
            {tab === 'sign-in' ? 'New to Pitch? ' : 'Already have an account? '}
            <button onClick={() => switchMode(tab === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {tab === 'sign-in' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="auth-legal">
            By continuing, you agree to our <a href="/terms">Terms of Service</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>

        {loading && (
          <div className="auth-connecting" role="status" aria-live="polite">
            <div className="auth-connecting-dialog">
              <div className="auth-provider-link">
                <span className="auth-provider-logo auth-provider-logo--pitch">
                  <img src={logoTab} alt="Pitch" />
                </span>
                <span className="auth-link-line">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="auth-provider-logo">
                  <GoogleIcon />
                </span>
              </div>
              <h3>Connecting to Google</h3>
              <p>A secure Google window is opening. This should only take a moment.</p>
              <div className="auth-progress">
                <span />
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
