import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

interface ProfileResponse {
  profile: { loggedInOrigins: string[]; lastSyncedAt: string | null } | null
  activeSessions: unknown[]
}

/**
 * Lightweight read of the user's browser profile — the set of origins they've
 * authenticated. Shared by /new (to hint whether a site is signed in) and
 * /sessions (after a save). Fails silently: an auth hint is non-critical.
 */
export function useBrowserProfile() {
  const { getToken } = useAuth()
  const [origins, setOrigins] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const data = await api.get<ProfileResponse>('/browser/profile', token)
      setOrigins(data.profile?.loggedInOrigins ?? [])
    } catch {
      /* non-critical — leave origins as-is */
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { origins, loading, refetch }
}
