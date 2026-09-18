import { render, screen, waitFor } from '@solidjs/testing-library'
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
})
