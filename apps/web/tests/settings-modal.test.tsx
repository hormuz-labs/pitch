import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiDelete, apiGet, apiPatch, apiPost, getToken, portalAssign, portalClose } = vi.hoisted(
  () => ({
    apiDelete: vi.fn(),
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
    apiPost: vi.fn(),
    getToken: vi.fn(async () => 'token'),
    portalAssign: vi.fn(),
    portalClose: vi.fn(),
  }),
)

vi.mock('@solidjs/router', () => ({
  useNavigate: () => vi.fn(),
  A: (props: { href: string; class?: string; children?: unknown }) => (
    <a href={props.href} class={props.class}>
      {props.children as never}
    </a>
  ),
}))
vi.mock('../src/lib/api', () => ({
  api: { delete: apiDelete, get: apiGet, patch: apiPatch, post: apiPost },
  isApiError: () => false,
}))
vi.mock('../src/solid/core/auth', () => ({
  useAuth: () => ({ getToken, signOut: vi.fn() }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
  useUser: () => ({
    userAccessor: () => ({
      externalAccounts: [],
      firstName: 'Ada',
      imageUrl: null,
      primaryEmailAddress: { emailAddress: 'ada@example.com' },
    }),
  }),
}))

import { SettingsModal, type SettingsSection } from '../src/solid/account/SettingsView'
import { BuyCreditsSection } from '../src/solid/account/settings/BuyCreditsSection'
import { PlansSection } from '../src/solid/account/settings/PlansSection'
import { UsageSection } from '../src/solid/account/settings/UsageSection'

const summary = {
  balance: 4200,
  activeSubscription: {
    planKey: 'max',
    creditsPerCycle: 5000,
    currentPeriodEnd: '2026-10-14T00:00:00.000Z',
  },
  transactions: [],
  usage: { credits: 800 },
}

function ModalHarness(props: { initial: SettingsSection }) {
  const [section, setSection] = createSignal(props.initial)
  return <SettingsModal section={section()} onSectionChange={setSection} onClose={vi.fn()} />
}

describe('settings modal UI', () => {
  beforeEach(() => {
    apiDelete.mockReset()
    apiGet.mockReset()
    apiPatch.mockReset()
    apiPost.mockReset()
    getToken.mockClear()
    portalAssign.mockClear()
    portalClose.mockClear()
    vi.spyOn(window, 'open').mockReturnValue({
      close: portalClose,
      location: { assign: portalAssign },
      opener: window,
    } as unknown as Window)
    apiGet.mockImplementation(async (path: string) => {
      if (path === '/credits') return summary
      if (path.startsWith('/credits/usage/daily')) {
        return [
          { date: '2026-09-16', studio: 12, api: 3 },
          { date: '2026-09-17', studio: 4, api: 6 },
          { date: '2026-09-18', studio: 0, api: 5 },
        ]
      }
      if (path === '/api-keys') return []
      if (path === '/affiliate/me') {
        return {
          code: 'ADA',
          status: 'active',
          stats: { clicks: 0, signups: 0, conversions: 0, creditsEarned: 0 },
        }
      }
      return {}
    })
  })

  it('keeps every settings destination reachable and marks the active section', async () => {
    render(() => <ModalHarness initial="notifications" />)

    expect(screen.getByRole('dialog', { name: 'Pitch settings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('switch', { name: 'Email notifications' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    expect(screen.getByRole('heading', { name: 'Set up your AI agent' })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByText('Create a dedicated API key')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'API' }))
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New key' })).toBeTruthy()
    expect(await screen.findByText('No API keys yet')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Help & support' }))
    expect(screen.getByRole('link', { name: /Contact support/ }).getAttribute('href')).toBe(
      'mailto:support@trypitch.co',
    )
    expect(screen.getByRole('link', { name: /Join our Discord/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read the documentation/ })).toBeTruthy()
  })

  it('renders rewards as three distinct, actionable regions', async () => {
    render(() => <ModalHarness initial="rewards" />)

    expect(screen.getByText('Your referral link')).toBeTruthy()
    expect(screen.getByText('Invite by email')).toBeTruthy()
    expect(screen.getByPlaceholderText('name@example.com')).toBeTruthy()
    expect(screen.getByText('Your referrals')).toBeTruthy()
    expect(screen.getByText('Promo code')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter promo code')).toBeTruthy()
    expect(await screen.findByText(/No referrals yet/)).toBeTruthy()
  })

  it('renders real daily usage totals, bars, dates, and the activity empty state', async () => {
    const { container } = render(() => <UsageSection />)

    expect(await screen.findByText('30 credits used in this range')).toBeTruthy()
    expect(screen.getByText('Studio 16')).toBeTruthy()
    expect(screen.getByText('API 14')).toBeTruthy()
    expect(container.querySelectorAll('.settings-chart__col')).toHaveLength(3)
    expect(container.querySelectorAll('.settings-chart__segment--studio')).toHaveLength(2)
    expect(container.querySelectorAll('.settings-chart__segment--api')).toHaveLength(3)
    expect(screen.getByText('3 daily bars · UTC')).toBeTruthy()
    expect(screen.getByText('No activity in this range.')).toBeTruthy()
  })

  it('keeps purchase, usage, and subscription information separated', async () => {
    const openUsage = vi.fn()
    const { container } = render(() => <BuyCreditsSection openUsage={openUsage} />)

    expect((await screen.findAllByText('4,200')).length).toBe(2)
    expect(screen.getByText('800 credits')).toBeTruthy()
    expect(screen.getByText('$20')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Buy credits' })).toBeTruthy()
    expect(screen.getByText('800 used')).toBeTruthy()
    expect(screen.getByText('Subscription options')).toBeTruthy()
    expect(
      within(container.querySelector('.settings-credit-purchase')!).getByText('Max'),
    ).toBeTruthy()
    expect(container.querySelector('.settings-plans .is-current')?.textContent).toContain('Max')
    expect(container.querySelector('.settings-plans .is-popular')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open usage' }))
    expect(openUsage).toHaveBeenCalledOnce()
  })

  it('recommends Pro only when the account has no active plan', async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === '/credits') return { ...summary, activeSubscription: null }
      return []
    })
    const { container } = render(() => <BuyCreditsSection />)

    await screen.findByText('No plan')
    expect(container.querySelector('.settings-plans .is-popular')?.textContent).toContain('Pro')
    expect(container.querySelector('.settings-plans .is-current')).toBeNull()
    expect(screen.getByText('Most popular')).toBeTruthy()
  })

  it('makes subscription cancellation discoverable for active subscribers', async () => {
    render(() => <PlansSection />)

    // the portal button renders in both states, so wait for the loaded subscription first
    expect(await screen.findByText('Manage subscription')).toBeTruthy()
    const manage = screen.getByRole('button', { name: 'Billing portal' })
    expect(screen.getByText(/or cancel in the secure billing portal/i)).toBeTruthy()
    expect(screen.getByText(/Renews Oct 1[34], 2026/)).toBeTruthy()
    expect(screen.getByText(/credits already in your balance stay yours/i)).toBeTruthy()

    apiGet.mockImplementation(async (path: string) =>
      path === '/checkout/billing-portal' ? { url: 'https://billing.example.test' } : summary,
    )
    fireEvent.click(manage)
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/checkout/billing-portal', 'token'))
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expect(portalAssign).toHaveBeenCalledWith('https://billing.example.test')
    expect(screen.getByRole('button', { name: 'Manage plan' })).toBeTruthy()
  })

  it('does not advertise cancellation without an active subscription', async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === '/credits') return { ...summary, activeSubscription: null }
      return []
    })
    render(() => <PlansSection />)

    expect(await screen.findByText(/view invoices and manage payment methods/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Billing portal' })).toBeTruthy()
    expect(screen.queryByText('Manage subscription')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Manage plan' })).toBeNull()
  })
})
