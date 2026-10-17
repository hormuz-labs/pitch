import { A } from '@solidjs/router'
import { ArrowUpRight } from 'lucide-solid'
import { applyPoster } from '../../components/landing/carouselPoster'
import { Seo } from '../core/Seo'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import { carouselAsset } from './productCatalog'
import { AGENCY_FILMS } from './showcaseFilms'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'

const bookingUrl = 'https://calendly.com/officialtrypitch/30min'

export const AgenCView = () => (
  <div class="lb-root lb-agenc-page">
    <Seo
      title="AgenC | Custom videos by the Pitch team"
      description="Work with the team at Pitch on a custom video for your brand, product, or launch. Book a call to tell us what you have in mind."
      path="/AgenC"
    />
    <LandingNav />
    <main>
      <section class="lb-agenc-hero" aria-labelledby="agenc-page-heading">
        <div class="lb-wrap lb-agenc-hero-inner">
          <p class="lb-agenc-kicker">AgenC · by the team at Pitch</p>
          <h1 id="agenc-page-heading" class="lb-agenc-page-title">
            Launch videos for <em>stories worth telling.</em>
          </h1>
          <p class="lb-agenc-page-lede">
            A custom video for your launch or product, made with the team behind Pitch.
          </p>
          <div class="lb-agenc-actions">
            <a class="lb-agenc-button" href={bookingUrl} target="_blank" rel="noopener noreferrer">
              Book a call <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <a class="lb-agenc-outline" href="#work">
              See the work
            </a>
          </div>
          <span class="lb-agenc-scroll" aria-hidden="true">
            ↓ &nbsp; SCROLL TO EXPLORE
          </span>
        </div>
      </section>

      <section id="work" class="lb-agenc-work" aria-labelledby="agenc-work-heading">
        <div class="lb-wrap">
          <div class="lb-agenc-section-head">
            <p class="lb-agenc-kicker">Made in Pitch</p>
            <h2 id="agenc-work-heading">See what’s possible.</h2>
            <p>
              A few films made with Pitch. Have something different in mind? Let’s make it together.
            </p>
          </div>
          <div class="lb-agenc-films">
            {AGENCY_FILMS.map(example => (
              <figure class="lb-agenc-film">
                <video
                  ref={element => applyPoster(element, example.file)}
                  src={carouselAsset(example.file)}
                  controls
                  playsinline
                  preload="metadata"
                  aria-label={`${example.title} ${example.category}`}
                />
                <figcaption>
                  <span>{example.title}</span>
                  <span>{example.category}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section class="lb-agenc-process" aria-labelledby="agenc-process-heading">
        <div class="lb-wrap lb-agenc-process-grid">
          <div>
            <p class="lb-agenc-kicker">The collaboration</p>
            <h2 id="agenc-process-heading">Your vision. Our team.</h2>
          </div>
          <ol>
            <li>
              <span>01 / Tell us the story</span>
              <p>Share what you’re launching, your timing, and the material you already have.</p>
            </li>
            <li>
              <span>02 / Find the direction</span>
              <p>We’ll talk through the brief and decide what the video needs to say and show.</p>
            </li>
            <li>
              <span>03 / Make it together</span>
              <p>Our team makes the video with your feedback guiding the final cut.</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="lb-agenc-close" aria-labelledby="agenc-close-heading">
        <div class="lb-wrap">
          <p class="lb-agenc-kicker">Have a project in mind?</p>
          <h2 id="agenc-close-heading">Let’s make something people remember.</h2>
          <p>Tell us the idea. We’ll start with a conversation.</p>
          <div class="lb-agenc-actions">
            <a class="lb-agenc-button" href={bookingUrl} target="_blank" rel="noopener noreferrer">
              Book a call <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <A class="lb-agenc-outline" href="/">
              Try Pitch yourself
            </A>
          </div>
          <span class="lb-agenc-booking-note">30-minute call · Opens Calendly in a new tab</span>
        </div>
      </section>
    </main>
    <LandingFooter />
  </div>
)
