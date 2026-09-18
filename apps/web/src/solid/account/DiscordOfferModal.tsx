import { X } from 'lucide-solid'
import { DiscordIcon } from '../public/brand'
import '../../styles/discord-offer.css'

export function DiscordOfferModal(props: {
  mode: 'announcement' | 'no-credits'
  onClose: () => void
  onClaimReward: () => void
  onBuyCredits?: () => void
}) {
  const announcement = () => props.mode === 'announcement'
  return (
    <div
      class="discord-offer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discord-offer-title"
    >
      <section
        class={`discord-offer__card${announcement() ? ' discord-offer__card--announcement' : ''}`}
      >
        <button class="discord-offer__close" aria-label="Close" onClick={props.onClose}>
          <X size={17} />
        </button>
        {announcement() && (
          <div class="discord-offer__stage" aria-hidden="true">
            <DiscordIcon size={76} />
          </div>
        )}
        <div class="discord-offer__content">
          {!announcement() && (
            <div class="discord-offer__icon" aria-hidden="true">
              <DiscordIcon size={28} />
            </div>
          )}
          <p class="discord-offer__eyebrow">Pitch on Discord</p>
          <h2 id="discord-offer-title">
            {announcement() ? 'Join our Discord. Get 250 credits.' : 'You’re out of Pitch credits'}
          </h2>
          <p>
            {announcement()
              ? 'Meet other creators, share your work, and get a one-time welcome reward. Connect Discord and verify you’ve joined to add 250 credits to your Pitch balance.'
              : 'Buy credits to continue, or join our Discord and get 250 welcome credits if you haven’t already.'}
          </p>
          <div class="discord-offer__actions">
            {!announcement() && (
              <button class="discord-offer__primary" onClick={props.onBuyCredits}>
                Buy credits
              </button>
            )}
            <button
              class={announcement() ? 'discord-offer__primary' : 'discord-offer__secondary'}
              onClick={props.onClaimReward}
            >
              Get welcome credits
            </button>
            {announcement() && (
              <button class="discord-offer__quiet" onClick={props.onClose}>
                Not now
              </button>
            )}
          </div>
          <small>One-time reward. Regular Pitch credits, usable toward any project.</small>
        </div>
      </section>
    </div>
  )
}
