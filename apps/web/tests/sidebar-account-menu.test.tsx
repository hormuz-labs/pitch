import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn(async () => 'token') }))

vi.mock('@solidjs/router', () => ({
  A: (props: { href: string; children: JSX.Element }) => <a href={props.href}>{props.children}</a>,
}))
vi.mock('../src/solid/core/auth', () => ({
  useAuth: () => ({ getToken }),
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ userAccessor: () => ({ firstName: 'Adnan', imageUrl: null }) }),
}))
vi.mock('../src/solid/core/theme', () => ({
  useTheme: () => ({ theme: () => 'light', setTheme: vi.fn() }),
}))

import { SidebarAccountMenu } from '../src/solid/account/SidebarAccountMenu'

describe('SidebarAccountMenu', () => {
  beforeEach(() => {
    getToken.mockClear()
  })

  it('shows Free beside the user name when there is no subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ balance: 0, activeSubscription: null }))),
    )
    render(() => <SidebarAccountMenu openSettings={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Open account menu' })
    expect(trigger.textContent).toContain('Adnan')
    await waitFor(() => expect(trigger.textContent).toContain('Free'))
  })

  it('uses the plan name for annual subscriptions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ balance: 2500, activeSubscription: { planKey: 'pro_annual' } }),
          ),
      ),
    )
    render(() => <SidebarAccountMenu openSettings={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open account menu' }).textContent).toContain(
        'Pro',
      ),
    )
  })

  it('refreshes the balance each time the menu opens by click or keyboard', async () => {
    let balance = 2500
    const fetchCredits = vi.fn(
      async () => new Response(JSON.stringify({ balance, activeSubscription: { planKey: 'pro' } })),
    )
    vi.stubGlobal('fetch', fetchCredits)
    render(() => <SidebarAccountMenu openSettings={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Open account menu' })
    await waitFor(() => expect(trigger.textContent).toContain('Pro'))

    balance = 2400
    fireEvent.click(trigger)
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /Credits/ }).textContent).toContain('2,400'),
    )
    expect(fetchCredits).toHaveBeenCalledTimes(2)
    expect(fetchCredits).toHaveBeenLastCalledWith(
      expect.stringContaining('/credits'),
      expect.objectContaining({ cache: 'no-store' }),
    )

    fireEvent.click(trigger)
    expect(fetchCredits).toHaveBeenCalledTimes(2)
    balance = 2300
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /Credits/ }).textContent).toContain('2,300'),
    )
    expect(fetchCredits).toHaveBeenCalledTimes(3)
  })

  it('keeps the last balance after a failed refresh and retries on reopening', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchCredits = vi.fn(
      async () =>
        new Response(JSON.stringify({ balance: 2500, activeSubscription: { planKey: 'pro' } })),
    )
    vi.stubGlobal('fetch', fetchCredits)
    render(() => <SidebarAccountMenu openSettings={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Open account menu' })
    await waitFor(() => expect(trigger.textContent).toContain('Pro'))

    fetchCredits.mockRejectedValueOnce(new Error('Offline'))
    fireEvent.click(trigger)
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(screen.getByRole('menuitem', { name: /Credits/ }).textContent).toContain('2,500')

    fireEvent.click(trigger)
    fetchCredits.mockResolvedValueOnce(
      new Response(JSON.stringify({ balance: 2100, activeSubscription: { planKey: 'pro' } })),
    )
    fireEvent.click(trigger)
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /Credits/ }).textContent).toContain('2,100'),
    )
    warn.mockRestore()
  })

  it('does not overwrite a fresh balance with an older response', async () => {
    let resolveOlder!: (response: Response) => void
    const fetchCredits = vi.fn(
      async () =>
        new Response(JSON.stringify({ balance: 2500, activeSubscription: { planKey: 'pro' } })),
    )
    vi.stubGlobal('fetch', fetchCredits)
    render(() => <SidebarAccountMenu openSettings={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Open account menu' })
    await waitFor(() => expect(trigger.textContent).toContain('Pro'))

    fetchCredits.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOlder = resolve
        }),
    )
    window.dispatchEvent(new Event('credits-changed'))
    await waitFor(() => expect(fetchCredits).toHaveBeenCalledTimes(2))
    fetchCredits.mockResolvedValueOnce(
      new Response(JSON.stringify({ balance: 2000, activeSubscription: { planKey: 'pro' } })),
    )
    fireEvent.click(trigger)
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /Credits/ }).textContent).toContain('2,000'),
    )

    const olderResponse = new Response()
    const readOlder = vi.spyOn(olderResponse, 'json').mockResolvedValue({
      balance: 2400,
      activeSubscription: { planKey: 'pro' },
    })
    resolveOlder(olderResponse)
    await waitFor(() => expect(readOlder).toHaveBeenCalled())
    expect(screen.getByRole('menuitem', { name: /Credits/ }).textContent).toContain('2,000')
  })
})
