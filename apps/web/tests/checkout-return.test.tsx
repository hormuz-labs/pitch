import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  navigate: vi.fn(),
  params: {} as Record<string, string>,
}))
const [loaded, setLoaded] = createSignal(true)
vi.mock('@solidjs/router', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.params],
}))
vi.mock('../src/lib/api', () => ({ api: { get: mocks.get } }))
vi.mock('../src/solid/core/auth', () => ({
  useAuth: () => ({ getToken: async () => 'token', isLoaded: loaded, userId: () => 'user_1' }),
  useUser: () => ({ userAccessor: () => ({ fullName: 'Ada Lovelace' }) }),
}))

import { CheckoutReturnView } from '../src/solid/account/CheckoutReturnView'

beforeEach(() => {
  vi.clearAllMocks()
  setLoaded(true)
  mocks.params = { checkout: 'success', subscription_id: 'sub_new' }
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  mocks.get.mockResolvedValue({
    status: 'succeeded',
    receipt: {
      id: 'sub_new',
      amount: '$45.00',
      credits: 10000,
      balance: 11234,
      name: 'Ada Lovelace',
      method: 'Subscription',
      date: 'October 3rd, 2026',
    },
  })
})

describe('checkout return', () => {
  it('waits for auth hydration, then displays the verified printer receipt', async () => {
    setLoaded(false)
    render(() => <CheckoutReturnView />)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(screen.queryByText('Payment Complete')).toBeNull()
    setLoaded(true)
    await screen.findByText('Payment Complete')
    expect(screen.getByText('$45.00')).toBeTruthy()
    expect(screen.getByText('11,234')).toBeTruthy()
    expect(screen.getByText('10,000 credits added to your account')).toBeTruthy()
    const claim = screen.getByRole('button', {
      name: 'Claim purchased credits',
    }) as HTMLButtonElement
    await waitFor(() => expect(claim.disabled).toBe(false))
    fireEvent.click(claim)
    expect(screen.getByText('+10,000 credits claimed')).toBeTruthy()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Start creating/ }))
    expect(mocks.navigate).toHaveBeenCalledWith('/new')
  })

  it('never celebrates a failed payment even with a success query parameter', async () => {
    mocks.get.mockResolvedValue({ status: 'failed' })
    render(() => <CheckoutReturnView />)
    await screen.findByText('Payment not completed')
    expect(screen.queryByText('Payment Complete')).toBeNull()
  })

  it('allows continuing without claiming and announces the balance refresh', async () => {
    const changed = vi.fn()
    window.addEventListener('credits-changed', changed)
    try {
      render(() => <CheckoutReturnView />)
      await screen.findByText('Payment Complete')
      expect(changed).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: /Continue to studio/ }))
      expect(mocks.navigate).toHaveBeenCalledWith('/new')
    } finally {
      window.removeEventListener('credits-changed', changed)
    }
  })

  it('does not invent a credit amount for a confirmation with no receipt', async () => {
    mocks.get.mockResolvedValue({ status: 'succeeded' })
    render(() => <CheckoutReturnView />)
    await screen.findByText('Payment Complete')
    expect(screen.queryByText(/credits added to your account/)).toBeNull()
  })
})
