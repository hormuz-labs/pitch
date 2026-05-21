import { useSignIn, useSignUp } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoTab from '../assets/logoTab.png';
import { PitchLogoAnimation } from '../components/PitchLogoAnimation';
import '../styles/auth.css';

const CALLBACK_URL = `${window.location.origin}/sso-callback`;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);


interface Props {
  mode?: 'sign-in' | 'sign-up';
}

export const AuthView = ({ mode = 'sign-in' }: Props) => {
  const [tab, setTab] = useState<'sign-in' | 'sign-up'>(mode);
  const [loading, setLoading] = useState<string | null>(null);
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const navigate = useNavigate();

  useEffect(() => {
    setTab(mode);
  }, [mode]);

  const oauth = async (strategy: 'oauth_google') => {
    setLoading(strategy);
    try {
      const handler = tab === 'sign-in' ? signIn : signUp;
      await handler?.authenticateWithRedirect({
        strategy,
        redirectUrl: CALLBACK_URL,
        redirectUrlComplete: '/dashboard',
      });
    } catch (e) {
      console.error(e);
      setLoading(null);
    }
  };

  const btnOpacity = (provider: string) =>
    loading && loading !== provider ? 0.45 : 1;

  return (
    <div className="auth-page">
      <div className="auth-dot-grid" />
      <div className="auth-vignette" />

      {loading && (
        <div className="auth-redirect-banner" aria-busy="true" aria-live="polite">
          <div className="auth-redirect-banner-logo">
            <PitchLogoAnimation startAnimation loop color="currentColor" />
          </div>
          <p className="auth-redirect-banner-caption">Redirecting to Google…</p>
        </div>
      )}

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-card-logo">
          <a href="/">
            <img src={logoTab} alt="PITCH" className="auth-card-logo-img" />
          </a>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          {(['sign-in', 'sign-up'] as const).map(t => (
            <button
              key={t}
              onClick={() => navigate(`/${t}`)}
              className={`auth-tab ${tab === t ? 'auth-tab--active' : 'auth-tab--inactive'}`}
            >
              {t === 'sign-in' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <p className="auth-subtitle">
          {tab === 'sign-in' ? 'Welcome back to Pitch.' : 'Start pitching in minutes.'}
        </p>

        <div className="auth-providers">
          <button
            className="auth-btn auth-btn--social"
            style={{ opacity: btnOpacity('oauth_google') }}
            onClick={() => oauth('oauth_google')}
            disabled={!!loading}
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>
        </div>

        <div id="clerk-captcha" />

        <p className="auth-switch" style={{ marginTop: 16 }}>
          {tab === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
          <button
            className="auth-switch-btn"
            onClick={() => navigate(tab === 'sign-in' ? '/sign-up' : '/sign-in')}
          >
            {tab === 'sign-in' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      </div>

      <p className="auth-footer-note">
        By continuing, you agree to our{' '}
        <a href="/privacy">Privacy Policy</a>
        {' '}and{' '}
        <a href="#">Terms</a>.
      </p>
    </div>
  );
};