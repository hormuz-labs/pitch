/**
 * Full-page takeover for "the backend is unreachable".
 *
 * Only wraps the signed-in app. A marketing visitor should never be shown a 503
 * because the render backend is down — those pages are static and do not need
 * the API at all.
 *
 * Goes down on the first transport failure announced by lib/api, then probes
 * /health on a backoff until the API answers. Any successful API call elsewhere
 * in the app clears it too, so a recovered connection does not wait on the next
 * poll tick.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { API_URL } from '../config'
import { API_REACHABLE_EVENT, API_UNREACHABLE_EVENT } from '../lib/api'
import { StatusView } from '../views/StatusView'

const BACKOFF_MS = [3_000, 6_000, 12_000, 20_000, 30_000]

export const ConnectionGate = ({ children }: { children: ReactNode }) => {
  const [down, setDown] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const attemptRef = useRef(0)

  const probe = useCallback(async () => {
    setRetrying(true)
    try {
      // cache: no-store so a cached 200 cannot mask an outage.
      const res = await fetch(`${API_URL}/health`, { cache: 'no-store' })
      if (res.ok) {
        attemptRef.current = 0
        setDown(false)
        return true
      }
    } catch {
      // still down
    } finally {
      setRetrying(false)
    }
    attemptRef.current += 1
    return false
  }, [])

  useEffect(() => {
    const onDown = () => setDown(true)
    const onUp = () => {
      attemptRef.current = 0
      setDown(false)
    }
    window.addEventListener(API_UNREACHABLE_EVENT, onDown)
    window.addEventListener(API_REACHABLE_EVENT, onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener(API_UNREACHABLE_EVENT, onDown)
      window.removeEventListener(API_REACHABLE_EVENT, onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  // Self-healing poll. Restarted on every failed attempt via attemptRef.
  useEffect(() => {
    if (!down) return
    const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)]
    const timer = setTimeout(probe, delay)
    return () => clearTimeout(timer)
  }, [down, probe, retrying])

  if (down) return <StatusView variant="offline" onRetry={probe} retrying={retrying} />
  return <>{children}</>
}
