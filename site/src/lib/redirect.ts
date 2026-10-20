/**
 * Post-auth destination handling.
 *
 * A signed-out visitor asking for a gated page is sent to
 * `/sign-up?redirect=<where they were going>`, and AuthView hands that value to
 * Clerk as the destination after sign-in. That makes it an open-redirect sink,
 * so the allowed shape is narrow: one leading slash, nothing a browser would
 * read as another origin.
 */

export const DEFAULT_REDIRECT = '/new'

export const safeRedirect = (value: string | null | undefined): string => {
  if (!value) return DEFAULT_REDIRECT

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Malformed percent-encoding. Fall through and judge the raw value.
  }

  // `//evil.com` and `https://evil.com` are both off-site to a browser.
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return DEFAULT_REDIRECT
  // Bouncing back to auth would loop.
  if (
    decoded.startsWith('/sign-in') ||
    decoded.startsWith('/sign-up') ||
    decoded.startsWith('/signin') ||
    decoded.startsWith('/signup')
  ) {
    return DEFAULT_REDIRECT
  }

  return decoded
}
