import { isApiError } from './api'

/**
 * Map a failed studio call to a user-facing message. A 402 means credits.
 */
export function describeStudioError(err: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(err)) {
    if (err.status === 402) {
      const balance = typeof err.body?.balance === 'number' ? err.body.balance : null
      const short =
        balance !== null ? `Not enough credits (you have ${balance}).` : 'Not enough credits.'
      return `${short} Top up to continue, or claim your one-time Discord welcome credits in Settings → Discord if you haven’t already.`
    }
    if (err.status === 409) return err.message || 'The agent is busy — try again in a moment.'
    if (err.status === 404) return 'That project no longer exists.'
    return err.message || fallback
  }
  return err instanceof Error && err.message ? err.message : fallback
}

export const isCreditsError = (err: unknown) => isApiError(err) && err.status === 402
