import { Globe2, LockKeyhole, X } from 'lucide-react'
import { prettyHost } from '../lib/authOrigins'
import '../styles/url-auth-prompt.css'

interface UrlAuthPromptProps {
  url: string
  onAuthenticate: () => void
  onContinuePublicly: () => void
}

/** A quiet decision point shown beside a composer when its prompt contains a URL. */
export function UrlAuthPrompt({ url, onAuthenticate, onContinuePublicly }: UrlAuthPromptProps) {
  const host = prettyHost(url)
  return (
    <div className="url-auth-suggestion-slot">
      <section className="url-auth-suggestion" aria-label={`Browser access for ${host}`}>
        <span className="url-auth-suggestion__icon" aria-hidden="true">
          <LockKeyhole size={15} />
        </span>
        <div className="url-auth-suggestion__copy">
          <strong>Does {host} need a login?</strong>
          <span>Authenticate once so Pitch can record the signed-in experience.</span>
        </div>
        <div className="url-auth-suggestion__actions">
          <button
            type="button"
            className="url-auth-suggestion__public"
            onClick={onContinuePublicly}
          >
            <Globe2 size={13} />
            Public site
          </button>
          <button
            type="button"
            className="url-auth-suggestion__authenticate"
            onClick={onAuthenticate}
          >
            Authenticate
          </button>
        </div>
        <button
          type="button"
          className="url-auth-suggestion__close"
          aria-label="Dismiss browser authentication suggestion"
          onClick={onContinuePublicly}
        >
          <X size={13} />
        </button>
      </section>
    </div>
  )
}
