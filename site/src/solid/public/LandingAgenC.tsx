import { A } from '@solidjs/router'
import { applyPoster } from '../../components/landing/carouselPoster'
import { carouselAsset } from './productCatalog'
import { AGENCY_FILMS } from './showcaseFilms'

export const LandingAgenC = () => (
  <section class="lb-band lb-agenc" aria-labelledby="agenc-heading">
    <div class="lb-wrap lb-agenc-inner">
      <div class="lb-agenc-head">
        <p class="lb-agenc-kicker">AgenC · by the team at Pitch</p>
        <h2 id="agenc-heading" class="lb-agenc-title">
          Want it made for you? <em>Our team directs it.</em>
        </h2>
        <p class="lb-agenc-copy">
          Custom launch videos directed end-to-end by our team, using Pitch. You own the final film.
        </p>
      </div>
      <div class="lb-agenc-showcase" aria-hidden="true">
        {AGENCY_FILMS.map((film, index) => (
          <video
            class={`lb-agenc-showcase-card ${index === 0 ? 'is-left' : index === 1 ? 'is-right' : 'is-center'}`}
            ref={element => applyPoster(element, film.file)}
            src={index === 2 ? `${carouselAsset(film.file)}#t=0.6` : undefined}
            muted
            loop={index === 2}
            playsinline
            autoplay={index === 2}
            preload="metadata"
          />
        ))}
      </div>
      <div class="lb-agenc-showcase-label">
        <span>Directed in Pitch</span>
        <strong>Launch films built around your story.</strong>
      </div>
      <A href="/AgenC" class="lb-agenc-button">
        Work with AgenC <span aria-hidden="true">↗</span>
      </A>
    </div>
  </section>
)
