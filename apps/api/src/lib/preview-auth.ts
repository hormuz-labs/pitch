/**
 * Viewing a live preview means loading projects/<internal>/index.html in an
 * iframe, which then pulls the engine, GSAP, fonts, screenshots and the mix
 * as plain subresource requests — none of which can carry a Clerk token. So
 * the first authenticated hit on a preview page sets a short-lived, signed
 * cookie scoped to the preview path; every subresource presents it.
 *
 * The grant names the user, so the per-user isolation of projects/<userId>--…
 * still holds for cookie-authenticated requests.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type express from 'express'

export const PREVIEW_COOKIE = 'pitch_preview'
export const PREVIEW_PATH = '/files'
const DEV_PREVIEW_PATH = '/api/files'
const GRANT_TTL_MS = 12 * 60 * 60 * 1000

const configuredSecret = process.env.PREVIEW_COOKIE_SECRET || process.env.CLERK_SECRET_KEY
if (
  (process.env.STUDIO_ROLE === 'api' || process.env.STUDIO_ROLE === 'worker') &&
  !process.env.PREVIEW_COOKIE_SECRET
)
  throw new Error('PREVIEW_COOKIE_SECRET is required when studio roles run separately')
const SECRET = configuredSecret || randomBytes(32).toString('hex')

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

export function previewGrant(userId: string, ttlMs = GRANT_TTL_MS): string {
  const payload = `${userId}.${Date.now() + ttlMs}`
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
}

/** The user id a grant cookie vouches for, or null when missing/invalid/expired. */
export function verifyPreviewGrant(cookie: string | undefined): string | null {
  if (!cookie) return null
  const dot = cookie.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = Buffer.from(cookie.slice(0, dot), 'base64url').toString('utf8')
  const mac = cookie.slice(dot + 1)
  const expected = sign(payload)
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
    return null
  const sep = payload.lastIndexOf('.')
  const userId = payload.slice(0, sep)
  const exp = Number(payload.slice(sep + 1))
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null
  return userId
}

export function setPreviewCookie(
  req: express.Request,
  res: express.Response,
  userId: string,
): void {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  const grant = previewGrant(userId)
  const options = {
    httpOnly: true,
    // The preview iframe is cross-site in production (app on one origin, API
    // on another), so the cookie must be SameSite=None there; Lax is enough
    // for the same-origin dev proxy and plain-http browsers refuse None.
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: GRANT_TTL_MS,
  } as const
  // Production loads /files directly. Vite exposes the same route through
  // /api/files and rewrites it only after the browser has chosen cookies, so
  // localhost needs its own equally narrow cookie path.
  res.cookie(PREVIEW_COOKIE, grant, { ...options, path: PREVIEW_PATH })
  res.cookie(PREVIEW_COOKIE, grant, { ...options, path: DEV_PREVIEW_PATH })
}
