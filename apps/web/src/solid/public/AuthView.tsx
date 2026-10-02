import { useLocation, useNavigate } from '@solidjs/router'
import { createEffect, createSignal, Show } from 'solid-js'
import pitchWordmark from '../../assets/logoB.svg'
import logoTab from '../../assets/logoTab.png'
import pitchAsciiAnimationUrl from '../../assets/pitch-ascii-animation.html?url'
import { safeRedirect } from '../../lib/redirect'
import { useSignIn, useSignUp } from '../core/auth'
import '../../styles/auth.css'

const CALLBACK_URL = `${window.location.origin}/sso-callback`

type OAuthStrategy = 'oauth_google' | 'oauth_github'

function GithubIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

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
  const [oauthPending, setOauthPending] = createSignal<OAuthStrategy | null>(null)
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

  // New accounts are made with Google only. Sign-in keeps email and GitHub so
  // the accounts made that way before still get in.
  const signingUp = () => tab() === 'sign-up'

  const complete = async (sessionId: string | null) => {
    if (!sessionId) throw new Error('Authentication completed without a session.')
    await signIn.setActive({ session: sessionId })
    navigate(redirectTo(), { replace: true })
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const resource = signIn.signIn()
      if (!resource) throw new Error('Sign-in is not ready yet.')
      if (verifying()) {
        const result = await resource.attemptFirstFactor({
          strategy: 'email_code',
          code: code().trim(),
        })
        if (result.status !== 'complete') throw new Error('That code could not be verified.')
        await complete(result.createdSessionId)
      } else {
        const result = await resource.create({
          identifier: email().trim(),
          password: password(),
        })
        if (result.status === 'complete') {
          await complete(result.createdSessionId)
        } else if (result.status === 'needs_first_factor') {
          const emailCodeFactor = result.supportedFirstFactors?.find(
            (factor: any) => factor.strategy === 'email_code',
          ) as { emailAddressId?: string } | undefined
          if (emailCodeFactor?.emailAddressId) {
            await result.prepareFirstFactor({
              strategy: 'email_code',
              emailAddressId: emailCodeFactor.emailAddressId,
            })
            setVerifying(true)
          } else {
            throw new Error('This account needs an additional verification method.')
          }
        } else {
          throw new Error('This account needs an additional verification method.')
        }
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  const oauth = async (strategy: OAuthStrategy) => {
    setLoading(true)
    setOauthPending(strategy)
    setError('')
    try {
      const resource = signingUp() ? signUp.signUp() : signIn.signIn()
      if (!resource) throw new Error('Authentication is not ready yet.')
      await resource.authenticateWithRedirect({
        strategy,
        redirectUrl: CALLBACK_URL,
        redirectUrlComplete: redirectTo(),
      })
    } catch (cause) {
      setError(errorMessage(cause))
      setLoading(false)
      setOauthPending(null)
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
                : signingUp()
                  ? 'Create your account'
                  : 'Sign in to Pitch'}
            </h2>
            <p>
              {verifying()
                ? `Enter the verification code sent to ${email()}.`
                : signingUp()
                  ? 'Start creating your first standout pitch.'
                  : 'Continue creating something remarkable.'}
            </p>
          </div>

          <Show when={!verifying()}>
            <div class="auth-oauth-stack">
              <button
                class="auth-oauth-btn"
                type="button"
                onClick={() => void oauth('oauth_google')}
                disabled={loading()}
              >
                <Show
                  when={oauthPending() !== 'oauth_google'}
                  fallback={<span class="auth-spinner" />}
                >
                  <GoogleIcon />
                </Show>
                <span>
                  {oauthPending() === 'oauth_google'
                    ? 'Connecting to Google…'
                    : `${signingUp() ? 'Sign up' : 'Continue'} with Google`}
                </span>
              </button>
              <Show when={!signingUp()}>
                <button
                  class="auth-oauth-btn"
                  type="button"
                  onClick={() => void oauth('oauth_github')}
                  disabled={loading()}
                >
                  <Show
                    when={oauthPending() !== 'oauth_github'}
                    fallback={<span class="auth-spinner" />}
                  >
                    <GithubIcon />
                  </Show>
                  <span>
                    {oauthPending() === 'oauth_github'
                      ? 'Connecting to GitHub…'
                      : 'Continue with GitHub'}
                  </span>
                </button>
              </Show>
            </div>
          </Show>

          <Show when={!signingUp() && !verifying()}>
            <div class="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[.12em] text-neutral-400 before:h-px before:flex-1 before:bg-neutral-200 after:h-px after:flex-1 after:bg-neutral-200">
              or
            </div>
          </Show>

          <Show when={!signingUp()}>
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
                    autocomplete="current-password"
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
              <button
                type="submit"
                disabled={loading()}
                class="mt-2 flex h-12 w-full items-center justify-center rounded-full border-0 bg-neutral-900 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-70"
              >
                {loading() ? (
                  <span class="auth-spinner border-neutral-600 border-t-white" />
                ) : verifying() ? (
                  'Verify email'
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </Show>
          <div id="clerk-captcha" />
          <Show when={error()}>
            {message => (
              <p class="auth-error" role="alert">
                {message()}
              </p>
            )}
          </Show>

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
          {strategy => {
            const isGithub = strategy() === 'oauth_github'
            const providerName = isGithub ? 'GitHub' : 'Google'
            return (
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
                      <Show when={isGithub} fallback={<GoogleIcon />}>
                        <GithubIcon />
                      </Show>
                    </span>
                  </div>
                  <h3>Connecting to {providerName}</h3>
                  <p>A secure {providerName} window is opening. This should only take a moment.</p>
                  <div class="auth-progress">
                    <span />
                  </div>
                </div>
              </div>
            )
          }}
        </Show>
      </section>
    </main>
  )
}

export default AuthView
