/**
 * Thin typed wrapper around fetch that injects the Clerk auth token and
 * throws a typed error (with `.status`) on non-2xx responses.
 * Callers obtain a token via `getToken()` from useAuth() and pass it in —
 * keeping hook usage out of this module so it stays testable.
 */
import { API_URL } from '../config'

type Method = 'GET' | 'POST' | 'DELETE'

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

  if (!res.ok) {
    const err: any = new Error(`HTTP ${res.status}`)
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
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body,
  })

  if (!res.ok) {
    const err: any = new Error(`HTTP ${res.status}`)
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
  postForm: <T>(path: string, token: string, body: FormData) =>
    formRequest<T>('POST', path, token, body),
  delete: <T>(path: string, token: string) => request<T>('DELETE', path, token),
}
