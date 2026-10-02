import { Clapperboard, Gift, MessageCircle, X } from 'lucide-solid'
import { DISCORD_WELCOME_CREDITS } from '../../lib/plans'
import { DiscordIcon } from '../public/brand'
import '../../styles/discord-offer.css'

export function DiscordOfferModal(props: {
  mode: 'announcement' | 'no-credits'
  onClose: () => void
  onClaimReward: () => void
  onBuyCredits?: () => void
  /** The API's welcome amount, when the caller has it. */
  credits?: number
}) {
  const announcement = () => props.mode === 'announcement'
  const credits = () => (props.credits ?? DISCORD_WELCOME_CREDITS).toLocaleString('en-US')
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
        <div class="discord-offer__content">
          {!announcement() && (
            <div class="discord-offer__icon" aria-hidden="true">
              <DiscordIcon size={28} />
            </div>
          )}
          <p class="discord-offer__eyebrow">{announcement() ? 'New' : 'Pitch on Discord'}</p>
          <h2 id="discord-offer-title">
            {announcement() ? 'Make more with the Pitch community' : 'You’re out of Pitch credits'}
          </h2>
          {announcement() ? (
            <div class="discord-offer__benefits">
              <p>
                <MessageCircle size={17} /> Get help and swap ideas with other creators
              </p>
              <p>
                <Clapperboard size={17} /> Share your work and see what others are making
              </p>
              <p>
                <Gift size={17} /> Get {credits()} credits when you connect and join
              </p>
            </div>
          ) : (
            <p>
              Buy credits to continue, or join our Discord and get {credits()} welcome credits if
              you haven’t already.
            </p>
          )}
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
              {announcement() ? `Join Discord and get ${credits()} credits` : 'Get welcome credits'}
            </button>
            {announcement() && (
              <button class="discord-offer__quiet" onClick={props.onClose}>
                Not now
              </button>
            )}
          </div>
          <small>One-time reward. Regular Pitch credits, usable toward any project.</small>
        </div>
        {announcement() && (
          <div class="discord-offer__stage" aria-hidden="true">
            <DiscordIcon size={112} />
            <span>Pitch community</span>
          </div>
        )}
      </section>
    </div>
  )
}
