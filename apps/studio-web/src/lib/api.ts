/**
 * Thin typed wrapper around fetch that injects the Clerk auth token and
 * throws a typed error (with `.status`, `.body`) on non-2xx responses.
 * Callers obtain a token via `getToken()` from useAuth() and pass it in —
 * keeping hook usage out of this module so it stays testable.
 */
import { API_URL } from '../config'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ApiError extends Error {
  status: number
  /** Parsed JSON body of the error response, when the server sent one. */
  body?: Record<string, any>
}

export const isApiError = (err: unknown): err is ApiError =>
  err instanceof Error && typeof (err as ApiError).status === 'number'

async function throwFor(res: Response): Promise<never> {
  let body: Record<string, any> | undefined
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  const message =
    (body && typeof body.error === 'string' && body.error) ||
    (body && typeof body.message === 'string' && body.message) ||
    `HTTP ${res.status}`
  const err = new Error(message) as ApiError
  err.status = res.status
  err.body = body
  throw err
}

async function request<T>(method: Method, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) await throwFor(res)

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
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body,
  })

  if (!res.ok) await throwFor(res)

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
