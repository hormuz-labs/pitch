import posthog, { type PostHogConfig } from 'posthog-js'
import { createEffect, onMount, type ParentProps } from 'solid-js'
import { useUser } from './auth.tsx'

const key = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const host = (import.meta.env.VITE_POSTHOG_HOST ?? '').trim() || 'https://us.i.posthog.com'

const options = {
  api_host: host,
  defaults: '2026-06-25',
  capture_pageview: 'history_change',
  capture_pageleave: true,
  capture_exceptions: true,
  person_profiles: 'identified_only',
  mask_personal_data_properties: true,
  session_recording: { maskAllInputs: true, recordCrossOriginIframes: true },
  enable_recording_console_log: true,
} satisfies Partial<PostHogConfig>

export function PostHogProvider(props: ParentProps) {
  const auth = useUser()

  onMount(() => {
    if (key && !posthog.__loaded) posthog.init(key, options)
  })

  createEffect(() => {
    if (!key || !auth.isLoaded()) return
    const user = auth.userAccessor()
    if (!user) {
      if (posthog._isIdentified()) posthog.reset()
      return
    }
    posthog.identify(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName,
    })
  })

  return props.children
}

export { posthog }
