/**
 * ProductView — the shared /product/:slug page. One template, driven by
 * productCatalog: a hero, a sample frame, three what-it-does points, links
 * to the sibling formats, and the landing endcap. Rendered standalone
 * (its own LandingNav + LandingFooter) the same way `/` is, so it works
 * signed-in or signed-out. Unknown slugs fall back to the landing page.
 */
import { useAuth } from '@clerk/react'
import { Link, Navigate } from 'react-router-dom'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { PRODUCTS, ProductGlyph, productBySlug } from '../components/landing/productCatalog'
import { Seo } from '../components/Seo'
import '../styles/landing.css'
import '../styles/landing-broadcast.css'

const DeckStill = () => (
  <div className="lb-prod-deck" aria-hidden="true">
    <span className="lb-prod-deck-slide" />
    <span className="lb-prod-deck-slide" />
    <span className="lb-prod-deck-slide">
      <b>Problem</b>
      <i />
      <i />
    </span>
  </div>
)

export const ProductView = ({ slug }: { slug?: string }) => {
  const { isSignedIn } = useAuth()
  const product = productBySlug(slug ?? '')

  if (!product) return <Navigate to="/" replace />

  const others = PRODUCTS.filter(p => p.slug !== product.slug)
  const ctaTo = isSignedIn ? product.href : `/sign-up?redirect=${encodeURIComponent(product.href)}`

  return (
    <>
      <Seo
        title={`Pitch — ${product.name}`}
        description={product.seoDescription}
        path={`/product/${product.slug}`}
      />

      <div className="lb-root">
        <LandingNav />

        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="lb-band lb-prod-hero" aria-labelledby="prod-heading">
          <div className="lb-wrap">
            <p className="lb-chy">{product.eyebrow}</p>
            <h1 id="prod-heading" className="lb-h2 lb-prod-title">
              {product.title}
            </h1>
            <p className="lb-sub lb-muted lb-prod-lede">{product.lede}</p>
            <div className="lb-prod-actions">
              <Link className="lb-cta" to={ctaTo}>
                {product.ctaLabel}
              </Link>
              <Link className="lb-cta lb-cta--ghost" to="/#work">
                See the work &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* ── Sample ────────────────────────────────────────── */}
        <section className="lb-band lb-prod-sample">
          <div className="lb-wrap">
            <div className="lb-prod-frame">
              {product.sampleSrc ? (
                <video
                  src={product.sampleSrc}
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="metadata"
                  aria-label={product.sampleCaption}
                />
              ) : (
                <DeckStill />
              )}
            </div>
            <p className="lb-prod-cap">{product.sampleCaption}</p>
          </div>
        </section>

        {/* ── What it does ──────────────────────────────────── */}
        <section className="lb-band lb-prod-points">
          <div className="lb-wrap">
            <div className="lb-prod-grid">
              {product.points.map(pt => (
                <div key={pt.h} className="lb-prod-point">
                  <h3>{pt.h}</h3>
                  <p>{pt.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Sibling formats ───────────────────────────────── */}
        <section className="lb-band lb-prod-more">
          <div className="lb-wrap">
            <p className="lb-chy">More from Pitch</p>
            <div className="lb-prod-more-grid">
              {others.map(p => (
                <Link key={p.slug} to={`/product/${p.slug}`} className="lb-prod-more-item">
                  <span className="lb-mega-ico">
                    <ProductGlyph icon={p.icon} size={15} />
                  </span>
                  <span className="lb-prod-more-copy">
                    <span className="lb-prod-more-name">{p.name} &rarr;</span>
                    <span className="lb-prod-more-desc">{p.nav}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Endcap + footer (must be direct siblings — the footer docks
             onto the endcap as a glass continuation) ─────────────────── */}
        <section className="lb-band lb-endcap">
          <div className="lb-endcap-inner">
            <div className="lb-endcap-copy">
              <h2 className="lb-endcap-title">
                Your {product.name.toLowerCase().replace(/s$/, '')} is
                <br /> one <em>sentence</em> away.
              </h2>
              <div className="lb-endcap-actions">
                <a
                  className="lb-endcap-link"
                  href="mailto:support@trypitch.co?subject=Pitch%20demo"
                >
                  Book a demo <span aria-hidden="true">↗</span>
                </a>
                <Link to={ctaTo} className="lb-endcap-primary">
                  {product.ctaLabel}
                </Link>
              </div>
            </div>
            <div className="lb-endcap-word" aria-hidden="true">
              PITCH
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </>
  )
}
