import { useLocation, useNavigate } from '@solidjs/router'
import { createEffect, createSignal, Show } from 'solid-js'
import pitchWordmark from '../../assets/logoB.svg'
import logoTab from '../../assets/logoTab.png'
import pitchAsciiAnimationUrl from '../../assets/pitch-ascii-animation.html?url'
import { safeRedirect } from '../../lib/redirect'
import { useSignIn, useSignUp } from '../core/auth'
import '../../styles/auth.css'

const CALLBACK_URL = `${window.location.origin}/sso-callback`

function GoogleIcon() {
  return (
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
}

const errorMessage = (error: unknown) => {
  if (typeof error === 'object' && error && 'errors' in error) {
    const errors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors
    const message = errors?.[0]?.longMessage ?? errors?.[0]?.message
    if (message) return message
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export function AuthView(props: { mode?: 'sign-in' | 'sign-up' }) {
  const [tab, setTab] = createSignal<'sign-in' | 'sign-up'>(props.mode ?? 'sign-in')
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [code, setCode] = createSignal('')
  const [verifying, setVerifying] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [oauthPending, setOauthPending] = createSignal(false)
  const [error, setError] = createSignal('')
  const signIn = useSignIn()
  const signUp = useSignUp()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = () => safeRedirect(new URLSearchParams(location.search).get('redirect'))

  createEffect(() => {
    setTab(props.mode ?? 'sign-in')
    setVerifying(false)
    setError('')
  })

  const complete = async (sessionId: string | null) => {
    if (!sessionId) throw new Error('Authentication completed without a session.')
    const setActive = tab() === 'sign-in' ? signIn.setActive : signUp.setActive
    await setActive({ session: sessionId })
    navigate(redirectTo(), { replace: true })
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (verifying()) {
        const resource = signUp.signUp()
        if (!resource) throw new Error('Sign-up is not ready yet.')
        const result = await resource.attemptEmailAddressVerification({ code: code().trim() })
        if (result.status !== 'complete') throw new Error('That code could not be verified.')
        await complete(result.createdSessionId)
      } else if (tab() === 'sign-in') {
        const resource = signIn.signIn()
        if (!resource) throw new Error('Sign-in is not ready yet.')
        const result = await resource.create({
          strategy: 'password',
          identifier: email().trim(),
          password: password(),
        })
        if (result.status !== 'complete') {
          throw new Error('This account needs an additional verification method.')
        }
        await complete(result.createdSessionId)
      } else {
        const resource = signUp.signUp()
        if (!resource) throw new Error('Sign-up is not ready yet.')
        const result = await resource.create({ emailAddress: email().trim(), password: password() })
        if (result.status === 'complete') await complete(result.createdSessionId)
        else {
          await result.prepareEmailAddressVerification({ strategy: 'email_code' })
          setVerifying(true)
        }
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  const oauth = async () => {
    setLoading(true)
    setOauthPending(true)
    setError('')
    try {
      const resource = tab() === 'sign-in' ? signIn.signIn() : signUp.signUp()
      if (!resource) throw new Error('Authentication is not ready yet.')
      await resource.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: CALLBACK_URL,
        redirectUrlComplete: redirectTo(),
      })
    } catch (cause) {
      setError(errorMessage(cause))
      setLoading(false)
      setOauthPending(false)
    }
  }

  const switchMode = (next: 'sign-in' | 'sign-up') => {
    setTab(next)
    setVerifying(false)
    setError('')
    navigate(`/${next}${location.search}`)
  }

  return (
    <main class="auth-page">
      <section class="auth-showcase" aria-label="Pitch product preview">
        <div class="auth-art">
          <iframe
            src={pitchAsciiAnimationUrl}
            title="Animated Pitch logo"
            class="auth-ascii-animation"
          />
        </div>
      </section>
      <section class="auth-form-side">
        <div class="auth-form-wrap">
          <a href="/" class="auth-form-brand" aria-label="Pitch home">
            <img src={pitchWordmark} alt="Pitch" />
          </a>
          <div class="auth-heading">
            <h2>
              {verifying()
                ? 'Check your email'
                : tab() === 'sign-up'
                  ? 'Create your account'
                  : 'Sign in to Pitch'}
            </h2>
            <p>
              {verifying()
                ? `Enter the verification code sent to ${email()}.`
                : tab() === 'sign-up'
                  ? 'Start creating your first standout pitch.'
                  : 'Continue creating something remarkable.'}
            </p>
          </div>

          <Show when={!verifying()}>
            <button
              class="auth-google-btn"
              type="button"
              onClick={() => void oauth()}
              disabled={loading()}
            >
              <Show when={!oauthPending()} fallback={<span class="auth-spinner" />}>
                <GoogleIcon />
              </Show>
              <span>
                {oauthPending()
                  ? 'Connecting to Google…'
                  : `${tab() === 'sign-up' ? 'Sign up' : 'Continue'} with Google`}
              </span>
            </button>
            <div class="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[.12em] text-neutral-400 before:h-px before:flex-1 before:bg-neutral-200 after:h-px after:flex-1 after:bg-neutral-200">
              or
            </div>
          </Show>

          <form class="space-y-3" onSubmit={submit}>
            <Show when={!verifying()}>
              <label class="block text-xs font-medium text-neutral-700">
                Email address
                <input
                  type="email"
                  autocomplete="email"
                  required
                  value={email()}
                  onInput={event => setEmail(event.currentTarget.value)}
                  class="mt-1.5 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100"
                />
              </label>
              <label class="block text-xs font-medium text-neutral-700">
                Password
                <input
                  type="password"
                  autocomplete={tab() === 'sign-in' ? 'current-password' : 'new-password'}
                  minlength={8}
                  required
                  value={password()}
                  onInput={event => setPassword(event.currentTarget.value)}
                  class="mt-1.5 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100"
                />
              </label>
            </Show>
            <Show when={verifying()}>
              <label class="block text-xs font-medium text-neutral-700">
                Verification code
                <input
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required
                  autofocus
                  value={code()}
                  onInput={event => setCode(event.currentTarget.value)}
                  class="mt-1.5 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-center text-lg tracking-[.3em] outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100"
                />
              </label>
            </Show>
            <div id="clerk-captcha" />
            <Show when={error()}>
              {message => (
                <p class="auth-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <button
              type="submit"
              disabled={loading()}
              class="mt-2 flex h-12 w-full items-center justify-center rounded-full border-0 bg-neutral-900 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-70"
            >
              {loading() ? (
                <span class="auth-spinner border-neutral-600 border-t-white" />
              ) : verifying() ? (
                'Verify email'
              ) : tab() === 'sign-up' ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <Show when={verifying()}>
            <p class="auth-switch">
              <button type="button" onClick={() => setVerifying(false)}>
                Use a different email
              </button>
            </p>
          </Show>
          <Show when={!verifying()}>
            <p class="auth-switch">
              {tab() === 'sign-in' ? 'New to Pitch? ' : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchMode(tab() === 'sign-in' ? 'sign-up' : 'sign-in')}
              >
                {tab() === 'sign-in' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
          </Show>
          <p class="auth-legal">
            By continuing, you agree to our <a href="/terms">Terms of Service</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>

        <Show when={oauthPending()}>
          <div class="auth-connecting" role="status" aria-live="polite">
            <div class="auth-connecting-dialog">
              <div class="auth-provider-link">
                <span class="auth-provider-logo auth-provider-logo--pitch">
                  <img src={logoTab} alt="Pitch" />
                </span>
                <span class="auth-link-line">
                  <i />
                  <i />
                  <i />
                </span>
                <span class="auth-provider-logo">
                  <GoogleIcon />
                </span>
              </div>
              <h3>Connecting to Google</h3>
              <p>A secure Google window is opening. This should only take a moment.</p>
              <div class="auth-progress">
                <span />
              </div>
            </div>
          </div>
        </Show>
      </section>
    </main>
  )
}

export default AuthView
