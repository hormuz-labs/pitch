import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { DiscordOfferModal } from '../src/solid/account/DiscordOfferModal'

describe('DiscordOfferModal', () => {
  it('renders distinct purchase and reward actions when credits run out', () => {
    const buy = vi.fn()
    const claim = vi.fn()
    render(() => (
      <DiscordOfferModal
        mode="no-credits"
        onClose={vi.fn()}
        onBuyCredits={buy}
        onClaimReward={claim}
      />
    ))

    const buyButton = screen.getByRole('button', { name: 'Buy credits' })
    const rewardButton = screen.getByRole('button', { name: 'Get welcome credits' })
    expect(buyButton.classList.contains('discord-offer__primary')).toBe(true)
    expect(rewardButton.classList.contains('discord-offer__secondary')).toBe(true)

    fireEvent.click(buyButton)
    fireEvent.click(rewardButton)
    expect(buy).toHaveBeenCalledOnce()
    expect(claim).toHaveBeenCalledOnce()
  })

  it('uses one primary action in announcement mode', () => {
    render(() => (
      <DiscordOfferModal mode="announcement" onClose={vi.fn()} onClaimReward={vi.fn()} />
    ))

    expect(screen.queryByRole('button', { name: 'Buy credits' })).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Join Discord and get 1,500 credits' })
        .classList.contains('discord-offer__primary'),
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(screen.getByText('Get help and swap ideas with other creators')).toBeTruthy()
    expect(screen.getByText('Share your work and see what others are making')).toBeTruthy()
  })

  it("shows the API's welcome amount when the caller has it", () => {
    render(() => (
      <DiscordOfferModal
        mode="no-credits"
        credits={1200}
        onClose={vi.fn()}
        onBuyCredits={vi.fn()}
        onClaimReward={vi.fn()}
      />
    ))
    expect(screen.getByText(/get 1,200 welcome credits/)).toBeTruthy()
  })
})
