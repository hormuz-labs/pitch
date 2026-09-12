import { ExternalLink } from 'lucide-solid'
import { For } from 'solid-js'
import { SOCIALS } from '../../public/socials'

export function SocialSection() {
  return (
    <section class="settings-card">
      <h4>Socials</h4>
      <p>Follow Pitch for updates, inspiration, and community conversations.</p>
      <nav class="settings-social-links" aria-label="Pitch social accounts">
        <For each={SOCIALS}>
          {social => (
            <a href={social.href} target="_blank" rel="noopener noreferrer">
              <i
                class={`settings-social-logo settings-social-logo--${social.label.toLowerCase()}`}
                aria-hidden="true"
              >
                {social.icon({ size: 18 })}
              </i>
              <span>{social.label}</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </For>
      </nav>
    </section>
  )
}
