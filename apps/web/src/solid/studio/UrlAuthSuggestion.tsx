import { Globe2, LockKeyhole, X } from 'lucide-solid'
import { prettyHost } from '../../lib/authOrigins'
import '../../styles/url-auth-prompt.css'

export function UrlAuthSuggestion(props: {
  url: string
  onPublic: () => void
  onAuthenticate: () => void
  onClose: () => void
}) {
  return (
    <div class="url-auth-suggestion-slot">
      <section class="url-auth-suggestion" aria-label="Website authentication">
        <span class="url-auth-suggestion__icon">
          <LockKeyhole size={15} />
        </span>
        <div class="url-auth-suggestion__copy">
          <strong>Does {prettyHost(props.url)} need a login?</strong>
          <span>Authenticate once so Pitch can use the signed-in experience.</span>
        </div>
        <div class="url-auth-suggestion__actions">
          <button type="button" class="url-auth-suggestion__public" onClick={props.onPublic}>
            <Globe2 size={13} /> Public site
          </button>
          <button
            type="button"
            class="url-auth-suggestion__authenticate"
            onClick={props.onAuthenticate}
          >
            Authenticate
          </button>
        </div>
        <button
          type="button"
          class="url-auth-suggestion__close"
          aria-label="Dismiss authentication suggestion"
          onClick={props.onClose}
        >
          <X size={13} />
        </button>
      </section>
    </div>
  )
}
