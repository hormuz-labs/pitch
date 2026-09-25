import { A, Navigate } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { useAuth } from '../core/auth'
import { Seo } from '../core/Seo'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import { PRODUCTS, ProductGlyph, productBySlug } from './productCatalog'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'

const signed = (a: ReturnType<typeof useAuth>) =>
  typeof a.isSignedIn === 'function' ? a.isSignedIn() : a.isSignedIn
export const ProductView = (props: { slug?: string }) => {
  const auth = useAuth(),
    product = () => productBySlug(props.slug ?? '')
  return (
    <Show when={product()} fallback={<Navigate href="/" />}>
      {p => (
        <div class="lb-root">
          <Seo
            title={p().seoTitle}
            description={p().seoDescription}
            path={`/product/${p().slug}`}
          />
          <LandingNav />
          <section class="lb-band lb-prod-hero">
            <div class="lb-wrap">
              <p class="lb-chy">{p().eyebrow}</p>
              <h1 class="lb-h2 lb-prod-title">{p().title}</h1>
              <p class="lb-sub lb-muted lb-prod-lede">{p().lede}</p>
              <div class="lb-prod-actions">
                <A
                  class="lb-cta"
                  href={
                    signed(auth) ? p().href : `/sign-up?redirect=${encodeURIComponent(p().href)}`
                  }
                >
                  {p().ctaLabel}
                </A>
                <A class="lb-cta lb-cta--ghost" href="/#work">
                  See the work →
                </A>
              </div>
            </div>
          </section>
          <Show when={p().sampleSrc || p().slug === 'pitch-decks'}>
            <section class="lb-band lb-prod-sample">
              <div class="lb-wrap">
                <div class="lb-prod-frame">
                  <Show
                    when={p().sampleSrc}
                    fallback={
                      <div class="lb-prod-deck">
                        <span class="lb-prod-deck-slide" />
                        <span class="lb-prod-deck-slide" />
                        <span class="lb-prod-deck-slide">
                          <b>Problem</b>
                          <i />
                          <i />
                        </span>
                      </div>
                    }
                  >
                    <video src={p().sampleSrc} muted loop playsinline autoplay preload="metadata" />
                  </Show>
                </div>
                <p class="lb-prod-cap">{p().sampleCaption}</p>
              </div>
            </section>
          </Show>
          <section class="lb-band lb-prod-points">
            <div class="lb-wrap">
              <div class="lb-prod-grid">
                <For each={p().points}>
                  {point => (
                    <div class="lb-prod-point">
                      <h3>{point.h}</h3>
                      <p>{point.p}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </section>
          <section class="lb-band lb-prod-more">
            <div class="lb-wrap">
              <p class="lb-chy">More from Pitch</p>
              <div class="lb-prod-more-grid">
                <For each={PRODUCTS.filter(x => x.slug !== p().slug)}>
                  {x => (
                    <A href={`/product/${x.slug}`} class="lb-prod-more-item">
                      <span class="lb-mega-ico">
                        <ProductGlyph icon={x.icon} />
                      </span>
                      <span class="lb-prod-more-copy">
                        <span class="lb-prod-more-name">{x.name} →</span>
                        <span class="lb-prod-more-desc">{x.nav}</span>
                      </span>
                    </A>
                  )}
                </For>
              </div>
            </div>
          </section>
          <section class="lb-band lb-endcap lb-endcap--plain">
            <div class="lb-endcap-inner">
              <div class="lb-endcap-copy">
                <h2 class="lb-endcap-title">
                  Your {p().endcap ?? p().name.toLowerCase().replace(/s$/, '')} is
                  <br /> one <em>sentence</em> away.
                </h2>
                <div class="lb-endcap-actions">
                  <a class="lb-endcap-link" href="mailto:support@trypitch.co">
                    Book a demo ↗
                  </a>
                  <A href={p().href} class="lb-endcap-primary">
                    {p().ctaLabel}
                  </A>
                </div>
              </div>
            </div>
          </section>
          <LandingFooter />
        </div>
      )}
    </Show>
  )
}
