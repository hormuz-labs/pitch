/**
 * productCatalog — the four things Pitch makes. Drives the nav "Product"
 * mega-menu and the shared /product/:slug page template. One entry per
 * output format; `href` is the in-app destination the page's CTA opens
 * (sign-up first for logged-out visitors, via ProductView).
 */
import { Clapperboard, Lightbulb, MonitorPlay, Presentation } from 'lucide-react'

/** Public MinIO bucket holding the sample videos (same source as VideoCarousel). */
const ASSET_BASE = (
  import.meta.env.VITE_CAROUSEL_ASSET_URL || 'https://s3.trypitch.co/carousel/carousel'
).replace(/\/$/, '')

export type ProductSlug = 'launch-videos' | 'product-demos' | 'explainers' | 'pitch-decks'
type IconKey = 'clapperboard' | 'monitor-play' | 'lightbulb' | 'presentation'

export interface ProductEntry {
  slug: ProductSlug
  /** mega-menu + page display name */
  name: string
  /** one-line mega-menu description */
  nav: string
  badge?: string
  icon: IconKey
  /** in-app flow the page CTA drops into */
  href: string
  ctaLabel: string
  /* page content */
  eyebrow: string
  title: string
  lede: string
  points: { h: string; p: string }[]
  /** sample clip (mp4). Absent → the page renders a static deck still. */
  sampleSrc?: string
  sampleCaption: string
  seoDescription: string
}

const ICONS: Record<IconKey, typeof Clapperboard> = {
  clapperboard: Clapperboard,
  'monitor-play': MonitorPlay,
  lightbulb: Lightbulb,
  presentation: Presentation,
}

export const ProductGlyph = ({ icon, size = 16 }: { icon: IconKey; size?: number }) => {
  const Icon = ICONS[icon]
  return <Icon size={size} strokeWidth={1.75} aria-hidden />
}

export const PRODUCTS: ProductEntry[] = [
  {
    slug: 'launch-videos',
    name: 'Launch videos',
    nav: 'Cinematic 60-second launch films from one line.',
    badge: 'Hot',
    icon: 'clapperboard',
    href: '/launch-video/new',
    ctaLabel: 'Make a launch video',
    eyebrow: 'Product · Launch videos',
    title: 'Launch films, from one sentence.',
    lede: 'Drop a URL and a line of direction. The agent visits your product, picks the moments worth showing, then narrates, scores and grades a cinematic 1080p launch video — ready for launch day.',
    points: [
      {
        h: 'Shot on the real product',
        p: 'No mockups or stock. The agent drives your live app in a browser and films what actually happens.',
      },
      {
        h: 'Narrated, scored, graded',
        p: 'A written VO in 40+ languages, a music bed and a colour grade — one pass, one place.',
      },
      {
        h: 'Every layer stays editable',
        p: 'Swap the voice, trim a scene or restyle a caption without a full re-render.',
      },
    ],
    sampleSrc: `${ASSET_BASE}/graphify.mp4`,
    sampleCaption: 'Graphify — “Make a 70-second launch video on graphify.com”',
    seoDescription:
      'Give Pitch a URL and a line of direction. An AI agent films your real product and cuts a scored, narrated 1080p launch video in minutes — no recording, no editing.',
  },
  {
    slug: 'product-demos',
    name: 'Product demos',
    nav: 'Narrated walkthroughs of your real user flows.',
    badge: 'Popular',
    icon: 'monitor-play',
    href: '/new',
    ctaLabel: 'Make a product demo',
    eyebrow: 'Product · Product demos',
    title: 'Demos that walk the real flow.',
    lede: 'Point Pitch at a flow — onboarding, the core loop, a single feature — and it signs in, clicks through it end to end, and narrates each step as a clean demo video.',
    points: [
      {
        h: 'It actually uses the product',
        p: 'The agent completes the flow like a user would, so the demo shows the product working, not a slideshow.',
      },
      {
        h: 'Scene-by-scene narration',
        p: 'Each step gets a spoken beat explaining what is happening and why it matters.',
      },
      {
        h: 'Re-shoot on a prompt',
        p: 'Flow changed? Ask for a re-cut of the affected scene — the rest of the demo stays put.',
      },
    ],
    sampleSrc: `${ASSET_BASE}/demo.mp4`,
    sampleCaption: 'shadcn/ui — a narrated walkthrough of the component workflow',
    seoDescription:
      'Pitch signs into your product, clicks through the real flow end to end, and narrates it as a clean demo video. Point it at onboarding or a single feature and get a shareable walkthrough.',
  },
  {
    slug: 'explainers',
    name: 'Explainers',
    nav: 'Make the complex obvious in about 30 seconds.',
    icon: 'lightbulb',
    href: '/new',
    ctaLabel: 'Make an explainer',
    eyebrow: 'Product · Explainers',
    title: 'Make the complex obvious.',
    lede: 'For the concept that always needs a whiteboard. Pitch builds a tight explainer that frames the problem, shows the product solving it, and lands the point — short enough to drop in a thread.',
    points: [
      {
        h: 'Problem → product → payoff',
        p: 'A three-beat structure the agent fills with your real screens and a plain-language script.',
      },
      {
        h: 'Built for the timeline',
        p: 'Vertical or wide, 20–45 seconds, captioned by default for muted autoplay.',
      },
      {
        h: 'On-message every time',
        p: 'The agent reads your site and docs first, so the wording matches how you already describe it.',
      },
    ],
    sampleSrc: `${ASSET_BASE}/gtmcofounder.mp4`,
    sampleCaption: 'GTM Cofounder — a 40-second “what it does and why” explainer',
    seoDescription:
      'Pitch turns the concept that needs a whiteboard into a tight 30-second explainer — problem, product, payoff — built from your real screens and captioned for the timeline.',
  },
  {
    slug: 'pitch-decks',
    name: 'Pitch decks',
    nav: 'Investor and sales decks, built from your URL.',
    icon: 'presentation',
    href: '/pdf',
    ctaLabel: 'Make a deck',
    eyebrow: 'Product · Pitch decks',
    title: 'Decks, built from your URL.',
    lede: 'Same agent, a different deliverable. Pitch researches your product and market, then writes and designs a slide deck — investor pitch, sales one-pager, board update — as an editable PDF.',
    points: [
      {
        h: 'Researched, not templated',
        p: 'It pulls your positioning, pricing and traction from the site before it writes a single slide.',
      },
      {
        h: 'Structured like a real pitch',
        p: 'Problem, solution, market, product, model, ask — with charts and tables where the numbers go.',
      },
      {
        h: 'Editable slide by slide',
        p: 'Every slide stays open in the editor — restyle, reorder or rewrite before you export.',
      },
    ],
    sampleCaption: 'A 10-slide seed deck generated from a single product URL',
    seoDescription:
      'Pitch researches your product and market, then writes and designs an editable slide deck — investor pitch, sales one-pager or board update — as a PDF you can still edit slide by slide.',
  },
]

export const productBySlug = (slug: string): ProductEntry | undefined =>
  PRODUCTS.find(p => p.slug === slug)
