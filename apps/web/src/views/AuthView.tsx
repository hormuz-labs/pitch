import { useSignIn, useSignUp } from '@clerk/clerk-react';
import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import logoWhite from '../assets/logo.svg';
import logoBlack from '../assets/logoB.svg';

const CALLBACK_URL = `${window.location.origin}/sso-callback`;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GitHubIcon = ({ color }: { color: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const bg          = isDark ? '#080808' : '#f5f5f5';
  const cardBg      = isDark ? '#121212' : '#ffffff';
  const cardBorder  = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
  const textPrimary = isDark ? '#ffffff' : '#111111';
  const textMuted   = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)';
  const accent      = isDark ? '#1DA1F2' : '#FF5A1F';
  const btnBorder   = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.09)';
  const btnBg       = isDark ? 'rgba(255,255,255,0.05)' : '#fff';
  const btnText     = isDark ? 'rgba(255,255,255,0.85)' : '#222';
  const glowA       = isDark ? 'rgba(29,161,242,0.35)' : 'rgba(255,90,31,0.28)';
  const glowB       = isDark ? 'rgba(29,161,242,0.12)' : 'rgba(255,90,31,0.10)';

  const oauth = async (strategy: 'oauth_google' | 'oauth_github' | 'oauth_linkedin_oidc') => {
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

  const btnStyle = (provider: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 20px',
    border: `1px solid ${btnBorder}`,
    borderRadius: 99,
    background: btnBg,
    color: btnText,
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'var(--font-sans)',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading && loading !== provider ? 0.5 : 1,
    transition: 'opacity 0.15s, background 0.15s',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Dot grid texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'} 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
        pointerEvents: 'none',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
      }} />

      {isDark ? (
        <>
          {/* Dark mode: radial glow from bottom */}
          <div style={{
            position: 'absolute',
            bottom: -350, left: '50%',
            transform: 'translateX(-50%)',
            width: '180vw', height: '110vh',
            background: `radial-gradient(ellipse at center bottom, ${glowA} 0%, ${glowB} 35%, transparent 65%)`,
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            top: -200, left: '50%',
            transform: 'translateX(-50%)',
            width: '100vw', height: '50vh',
            background: `radial-gradient(ellipse at center top, ${glowB} 0%, transparent 65%)`,
            pointerEvents: 'none',
          }} />
        </>
      ) : (
        /* Light mode: rising horizontal lines of decreasing thickness */
        <svg
          style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 340, pointerEvents: 'none' }}
          viewBox="0 0 1000 340"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* thick + opaque at bottom → thin + faint going up */}
          {[
            { y: 308, h: 22  },
            { y: 278, h: 17  },
            { y: 252, h: 13  },
            { y: 230, h: 10  },
            { y: 212, h: 7.5 },
            { y: 197, h: 5.5 },
            { y: 184, h: 4   },
            { y: 173, h: 2.8 },
            { y: 164, h: 1.8 },
            { y: 157, h: 1.2 },
            { y: 151, h: 0.8 },
          ].map((line, i, arr) => (
            <rect
              key={i}
              x={0} y={line.y} width={1000} height={line.h}
              fill="#FF5A1F"
              opacity={0.90 - (i / (arr.length - 1)) * 0.72}
            />
          ))}
        </svg>
      )}

      {/* Logo wordmark */}
      <a href="/" style={{ display: 'block', marginBottom: 24, textDecoration: 'none', position: 'relative', zIndex: 1 }}>
        <img
          src={isDark ? logoWhite : logoBlack}
          alt="PITCH"
          style={{ height: 38, width: 'auto', display: 'block' }}
        />
      </a>

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 380,
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: 20,
        padding: '36px 32px 32px',
        boxShadow: isDark
          ? '0 0 0 1px rgba(255,255,255,0.06), 0 8px 16px rgba(0,0,0,0.4), 0 32px 80px rgba(0,0,0,0.6)'
          : '0 0 0 1px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.04), 0 24px 60px rgba(0,0,0,0.10)',
      }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: textPrimary, letterSpacing: '-0.4px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
          {tab === 'sign-in' ? 'Sign in' : 'Create account'}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: textMuted, textAlign: 'center' }}>
          {tab === 'sign-in' ? 'Welcome back to Pitch.' : 'Start pitching in minutes.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={btnStyle('oauth_google')} onClick={() => oauth('oauth_google')} disabled={!!loading}>
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>
          <button style={btnStyle('oauth_github')} onClick={() => oauth('oauth_github')} disabled={!!loading}>
            <GitHubIcon color={isDark ? 'rgba(255,255,255,0.85)' : '#222'} />
            <span>Continue with GitHub</span>
          </button>
          <button style={btnStyle('oauth_linkedin_oidc')} onClick={() => oauth('oauth_linkedin_oidc')} disabled={!!loading}>
            <LinkedInIcon />
            <span>Continue with LinkedIn</span>
          </button>
        </div>
      </div>

      {/* Switch mode */}
      <p style={{ position: 'relative', zIndex: 1, marginTop: 20, fontSize: 13, color: textMuted }}>
        {tab === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
        <button
          onClick={() => setTab(tab === 'sign-in' ? 'sign-up' : 'sign-in')}
          style={{ background: 'none', border: 'none', padding: 0, color: accent, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          {tab === 'sign-in' ? 'Create account' : 'Sign in'}
        </button>
      </p>
    </div>
  );
};
