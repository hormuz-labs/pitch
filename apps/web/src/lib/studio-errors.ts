import { isApiError } from './api'

/**
 * Map a failed studio call to a user-facing message. A 402 means credits.
 */
export function describeStudioError(err: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(err)) {
    if (err.status === 402) {
      const balance = typeof err.body?.balance === 'number' ? err.body.balance : null
      return balance !== null
        ? `Not enough credits (you have ${balance}). Top up to continue.`
        : 'Not enough credits. Top up to continue.'
    }
    if (err.status === 409) return err.message || 'The agent is busy — try again in a moment.'
    if (err.status === 404) return 'That project no longer exists.'
    return err.message || fallback
  }
  return err instanceof Error && err.message ? err.message : fallback
}

export const isCreditsError = (err: unknown) => isApiError(err) && err.status === 402
