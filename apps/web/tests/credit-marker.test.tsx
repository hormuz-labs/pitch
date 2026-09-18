import { render, screen, waitFor } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@solidjs/router', () => ({
  A: (props: { href: string; children: JSX.Element; 'aria-label'?: string }) => (
    <a href={props.href} aria-label={props['aria-label']}>
      {props.children}
    </a>
  ),
}))

import { CreditMarker } from '../src/solid/studio/CreditMarker'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>(done => (resolve = done)), resolve }
}

describe('CreditMarker', () => {
  it('does not let a stale REST response overwrite a live projected balance', async () => {
    const response = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise),
    )
    render(() => (
      <CreditMarker store={{ busy: false, project: null, getToken: async () => 'token' } as any} />
    ))

    window.dispatchEvent(
      new CustomEvent('credits-changed', { detail: { balance: 740, pending: true } }),
    )
    expect(screen.getByRole('link', { name: /740 credits remaining/ })).not.toBeNull()

    response.resolve(new Response(JSON.stringify({ balance: 800 })))
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.getByRole('link', { name: /740 credits remaining/ })).not.toBeNull()
  })

  it('accepts the final authoritative balance after a projected update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    render(() => (
      <CreditMarker store={{ busy: true, project: null, getToken: async () => 'token' } as any} />
    ))
    window.dispatchEvent(
      new CustomEvent('credits-changed', { detail: { balance: 740, pending: true } }),
    )
    window.dispatchEvent(
      new CustomEvent('credits-changed', { detail: { balance: 735, pending: false } }),
    )
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /735 credits remaining/ })).not.toBeNull(),
    )
  })
})
