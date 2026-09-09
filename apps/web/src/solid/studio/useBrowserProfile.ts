import { createEffect, createSignal, on } from 'solid-js'
import { api } from '../../lib/api'
import { useAuth } from '../core/auth'
export function useBrowserProfile() {
  const auth = useAuth()
  const [origins, setOrigins] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(true)
  const refetch = async () => {
    try {
      const token = await auth.getToken()
      if (!token) return
      const data = await api.get<{ profile: { loggedInOrigins: string[] } | null }>(
        '/browser/profile',
        token,
      )
      setOrigins(data.profile?.loggedInOrigins ?? [])
    } catch {
    } finally {
      setLoading(false)
    }
  }
  createEffect(
    on(
      () => auth.getToken,
      () => void refetch(),
      { defer: false },
    ),
  )
  return { origins, loading, refetch }
}
