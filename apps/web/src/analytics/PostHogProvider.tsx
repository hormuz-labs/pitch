import { useUser } from '@clerk/react'
import type { PostHogConfig } from 'posthog-js'
import { PostHogProvider as PostHogReactProvider, usePostHog } from 'posthog-js/react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST ?? '').trim() || 'https://us.i.posthog.com'

/**
 * ChunkLoadError auto-retry: Clerk/vendor chunks occasionally fail to load on
 * slow connections. One reload is almost always enough to recover.
 * Guard against infinite reload loops with sessionStorage.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    if (reason?.name === 'ChunkLoadError' || /Loading chunk \d+ failed/i.test(reason?.message ?? '')) {
      const key = 'chunk_reload_attempted'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
      }
    }
  })
}

const options = {
  api_host: POSTHOG_HOST,
  defaults: '2026-06-25',
  capture_pageview: 'history_change',
  capture_pageleave: true,
  capture_exceptions: true,
  person_profiles: 'identified_only',
  mask_personal_data_properties: true,
  // Suppress noise from browser extensions (e.g. password managers) that
  // inject postMessage listeners and emit "Object Not Found Matching Id" errors
  // which have no stack trace and originate entirely outside our code.
  __preview_send_client_session_params: false,
  session_recording: {
    // Launch prompts and project details can be sensitive. Keep replay useful
    // while preventing any form/textarea values from being recorded.
    maskAllInputs: true,
    // Capture console errors/warnings in recordings — critical for diagnosing
    // Instagram WebView TypeErrors and other browser-specific crashes.
    recordCrossOriginIframes: true,
  },
  // Surface console errors inside PostHog session replay timeline.
  enable_recording_console_log: true,
} satisfies Partial<PostHogConfig>

function ClerkPostHogIdentity() {
  const { isLoaded, isSignedIn, user } = useUser()
  const posthog = usePostHog()
  const userId = user?.id
  const email = user?.primaryEmailAddress?.emailAddress
  const name = user?.fullName

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn && userId) {
      posthog.identify(userId, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      })
      return
    }

    // Prevent one account's events being attributed to the previous account
    // on shared devices after Clerk signs out.
    if (posthog._isIdentified()) posthog.reset()
  }, [email, isLoaded, isSignedIn, name, posthog, userId])

  return null
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  // Local/test environments work normally without analytics configuration.
  if (!POSTHOG_KEY) return children

  return (
    <PostHogReactProvider apiKey={POSTHOG_KEY} options={options}>
      <ClerkPostHogIdentity />
      {children}
    </PostHogReactProvider>
  )
}
