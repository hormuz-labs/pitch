/**
 * Thin typed wrapper around fetch that injects the Clerk auth token and
 * throws a typed error (with `.status`) on non-2xx responses.
 * Callers obtain a token via `getToken()` from useAuth() and pass it in —
 * keeping hook usage out of this module so it stays testable.
 */
import { API_URL } from '../config'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Event fired when the API cannot be reached at all (see ConnectionGate). */
export const API_UNREACHABLE_EVENT = 'pitch:api-unreachable'
/** Event fired on any successful response, so a down state can clear itself. */
export const API_REACHABLE_EVENT = 'pitch:api-reachable'

/**
 * Statuses that mean "the request never got to our server". 502/504 are the
 * usual proxy failures; 52x and 530 are Cloudflare's own codes, including 1033
 * (tunnel down), which arrives as 530 with a Cloudflare HTML body. Treating
 * these as HTTP errors made them surface as a raw Cloudflare page or a blank
 * screen rather than something we control.
 */
const UNREACHABLE_STATUSES = new Set([502, 503, 504, 521, 522, 523, 524, 530])

export interface ApiError extends Error {
  status?: number
  /** True when the backend could not be reached, as opposed to refusing. */
  unreachable?: boolean
}

function announce(unreachable: boolean) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(unreachable ? API_UNREACHABLE_EVENT : API_REACHABLE_EVENT))
}

/** fetch, but a transport failure becomes a typed, announced ApiError. */
async function send(input: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (cause) {
    // fetch only rejects when the request never completed: DNS, TLS, refused
    // connection, offline. Anything the server answered lands below.
    const err: ApiError = new Error('Could not reach the Pitch API', { cause })
    err.unreachable = true
    announce(true)
    throw err
  }

  if (UNREACHABLE_STATUSES.has(res.status)) {
    const err: ApiError = new Error(`Pitch API unreachable (HTTP ${res.status})`)
    err.status = res.status
    err.unreachable = true
    announce(true)
    throw err
  }

  announce(false)
  return res
}

async function request<T>(method: Method, path: string, token: string, body?: unknown): Promise<T> {
  const res = await send(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const err: ApiError = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }

  if (res.status === 204) {
    return null as unknown as T
  }

  return res.json() as Promise<T>
}

async function formRequest<T>(
  method: Method,
  path: string,
  token: string,
  body: FormData,
): Promise<T> {
  const res = await send(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body,
  })

  if (!res.ok) {
    const err: ApiError = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }

  if (res.status === 204) {
    return null as unknown as T
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, token: string) => request<T>('GET', path, token),
  post: <T>(path: string, token: string, body?: unknown) => request<T>('POST', path, token, body),
  patch: <T>(path: string, token: string, body?: unknown) => request<T>('PATCH', path, token, body),
  postForm: <T>(path: string, token: string, body: FormData) =>
    formRequest<T>('POST', path, token, body),
  delete: <T>(path: string, token: string) => request<T>('DELETE', path, token),
}
