import { A, useParams } from '@solidjs/router'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { useAuth } from '../core/auth'
import { Seo } from '../core/Seo'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/blog.css'
import '../../styles/pagination.css'

interface Post {
  slug: string
  category: string
  readTime: string
  date: string
  title: string
  excerpt: string
  keywords: string[]
  content: string[]
}
export const BLOG_POSTS: Post[] = [
  [
    'why-every-saas-needs-a-demo-video',
    'Product Marketing',
    '5 min read',
    'May 28, 2026',
    'Why Every SaaS Product Needs a Demo Video in 2026',
    'B2B buyers watch multiple videos before talking to sales. A good demo video can cut sales cycles and increase sign-ups.',
  ],
  [
    'ai-agents-replacing-screen-recorders',
    'AI & Automation',
    '7 min read',
    'May 22, 2026',
    'How AI Agents Are Replacing Screen Recorders',
    'Screen recording tools require manual clicking and editing. AI agents browse your product autonomously and deliver a finished video.',
  ],
  [
    'onboarding-videos-reduce-churn',
    'Customer Success',
    '6 min read',
    'May 15, 2026',
    'Onboarding Videos That Actually Reduce Churn',
    'Users who never reach their aha moment churn quickly. Contextual onboarding videos increase activation rates and reduce support tickets.',
  ],
  [
    'pitch-deck-vs-demo-video',
    'Sales',
    '4 min read',
    'May 8, 2026',
    'Pitch Deck vs. Demo Video: Which Converts More Leads?',
    'Slide decks require cognitive effort. Demo videos are dynamic and memorable. Prospects who watch a demo video book more discovery calls.',
  ],
  [
    'product-hunt-launch-video-guide',
    'Growth',
    '8 min read',
    'Apr 30, 2026',
    'The Ultimate Guide to a Product Hunt Launch Video',
    'Product Hunt visitors decide whether to engage in five seconds. Listings with a high-quality demo video get twice as many upvotes.',
  ],
  [
    'scaling-content-production-ai',
    'AI & Automation',
    '6 min read',
    'Apr 22, 2026',
    "Scaling Video Content Production with AI: A Founder's Playbook",
    'AI video generation allows small teams to produce content at the speed of a full production house.',
  ],
  [
    'b2b-cold-outreach-video',
    'Sales',
    '5 min read',
    'Apr 14, 2026',
    'Using Personalized Demo Videos in B2B Cold Outreach',
    'Cold emails with a GIF thumbnail linking to a personalized demo get higher reply rates than text-only emails.',
  ],
  [
    'future-of-product-demos',
    'Industry Trends',
    '9 min read',
    'Apr 5, 2026',
    'The Future of Product Demos: Interactive, AI-Narrated, and On-Demand',
    "Next-generation product demos will be interactive, tailored to the viewer's role, and generated instantly.",
  ],
  [
    'voice-selection-demo-videos',
    'Product Tips',
    '3 min read',
    'Mar 28, 2026',
    'Picking the Right AI Voice for Your Demo Video',
    'Voice tone and pace affect how users perceive your product.',
  ],
  [
    'best-ai-tools-for-startup-founders-2026',
    'Growth',
    '8 min read',
    'May 30, 2026',
    'Best AI Tools for Startup Founders in 2026',
    'Top founders use AI tools to build, sell, and fundraise faster with smaller teams.',
  ],
  [
    'ai-go-to-market-strategy-saas',
    'Growth',
    '7 min read',
    'May 26, 2026',
    'How to Build an AI-Powered Go-to-Market Strategy for SaaS',
    'AI changes how SaaS companies attract and retain customers.',
  ],
  [
    'replace-sales-engineer-ai-demo-automation',
    'Sales',
    '6 min read',
    'May 20, 2026',
    'How AI Demo Automation Is Replacing the Sales Engineer Role',
    'AI demo tools automate repeatable product walkthroughs quickly and cheaply.',
  ],
  [
    'ai-for-investor-fundraising-demo',
    'Growth',
    '5 min read',
    'May 13, 2026',
    'How Founders Are Using AI Demo Videos to Close Investor Meetings',
    'A concise product demo helps investors understand the product before the first meeting.',
  ],
  [
    'async-demo-vs-live-demo-saas-sales',
    'Sales',
    '5 min read',
    'May 5, 2026',
    'Async Demo vs. Live Demo: Which Converts More SaaS Deals?',
    'Async demos let prospects evaluate a product without scheduling a call.',
  ],
  [
    'generative-ai-product-marketing-2026',
    'Product Marketing',
    '7 min read',
    'Apr 28, 2026',
    'How Generative AI Is Transforming Product Marketing in 2026',
    'Product marketing teams use generative AI to make launch assets faster.',
  ],
  [
    'chatgpt-perplexity-product-discovery-2026',
    'Industry Trends',
    '6 min read',
    'Apr 18, 2026',
    'How Buyers Now Discover Software via ChatGPT and Perplexity',
    'Software buyers increasingly use AI assistants for research.',
  ],
  [
    'zero-shot-demo-video-from-url',
    'AI & Automation',
    '4 min read',
    'Apr 10, 2026',
    'Zero-Shot Demo Video: Generate a Product Walkthrough from Just a URL',
    'Generate a professional demo by giving an AI agent a product URL.',
  ],
  [
    'product-led-growth-ai-2026',
    'Growth',
    '8 min read',
    'Mar 20, 2026',
    'Product-Led Growth + AI: The 2026 Playbook',
    'Product-led companies use AI for demos and onboarding to grow efficiently.',
  ],
].map(([slug, category, readTime, date, title, excerpt]) => ({
  slug,
  category,
  readTime,
  date,
  title,
  excerpt,
  keywords: ['AI demo video generator', 'product demo software', 'SaaS growth'],
  content: [
    excerpt,
    `${title} matters because buyers want to understand a product before committing time to a call. A concise demonstration makes the value concrete.`,
    `Pitch uses an agent to navigate the real product, capture the important flow, write narration, and produce a polished video. This turns video production into a repeatable part of the team’s workflow.`,
    `The strongest results come from a clear brief, a focused audience, and one outcome per video. Teams can then update or adapt the result as the product changes.`,
  ],
}))
const categories = [
  'All',
  'AI & Automation',
  'Product Marketing',
  'Sales',
  'Growth',
  'Customer Success',
  'Product Tips',
  'Industry Trends',
]
const shell = (auth: ReturnType<typeof useAuth>, children: any) => (
  <div
    class={`min-h-screen flex flex-col ${typeof auth.isSignedIn === 'function' ? (auth.isSignedIn() ? '' : 'lb-root') : auth.isSignedIn ? '' : 'lb-root'}`}
  >
    <Show when={!(typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn)}>
      <LandingNav />
    </Show>
    {children}
    <Show when={!(typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn)}>
      <LandingFooter />
    </Show>
  </div>
)
export const BlogPostView = () => {
  const auth = useAuth(),
    params = useParams(),
    post = () => BLOG_POSTS.find(p => p.slug === params.slug)
  return shell(
    auth,
    <Show
      when={post()}
      fallback={
        <div class="max-w-6xl mx-auto px-6 py-16">
          <A href="/blog">Back to Blog</A>
          <h1>Post not found.</h1>
        </div>
      }
    >
      {p => (
        <>
          <Seo
            title={`${p().title} — Pitch Blog`}
            description={p().excerpt}
            path={`/blog/${p().slug}`}
          />
          <article class="blog-shell blog-post">
            <A href="/blog" class="blog-back">
              ← Back to Blog
            </A>
            <header class="blog-post-head">
              <p class="blog-post-meta">
                <i />
                {p().category} · {p().readTime} · {p().date}
              </p>
              <h1 class="blog-post-title">{p().title}</h1>
            </header>
            <div class="blog-post-body">
              <For each={p().content}>{x => <p>{x}</p>}</For>
            </div>
            <div class="blog-related">
              <p class="blog-related-label">Related topics</p>
              <div class="blog-tags">
                <For each={p().keywords}>
                  {x => (
                    <A href="/sign-up" class="blog-tag">
                      {x}
                    </A>
                  )}
                </For>
              </div>
            </div>
          </article>
        </>
      )}
    </Show>,
  )
}
export const Blog = () => {
  const auth = useAuth(),
    [category, setCategory] = createSignal('All'),
    [page, setPage] = createSignal(1),
    [email, setEmail] = createSignal(''),
    [subscribed, setSubscribed] = createSignal(false),
    [error, setError] = createSignal('')
  const filtered = createMemo(() =>
      category() === 'All' ? BLOG_POSTS : BLOG_POSTS.filter(p => p.category === category()),
    ),
    shown = createMemo(() => filtered().slice((page() - 1) * 6, page() * 6)),
    pages = createMemo(() => Math.ceil(filtered().length / 6))
  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email().trim() }),
      })
      if (r.ok) setSubscribed(true)
      else setError('Failed to subscribe. Please try again.')
    } catch {
      setError('Network error. Please try again.')
    }
  }
  return shell(
    auth,
    <>
      <Seo
        title="Blog — Pitch"
        description="Guides on AI demo videos, product marketing, and go-to-market for SaaS founders."
        path="/blog"
      />
      <div class="blog-shell">
        <header class="blog-head">
          <p class="lb-chy">Writing</p>
          <h1 class="blog-title">Notes from the cutting room</h1>
          <p class="blog-lede">
            Ideas on AI video, product growth, and the future of how software sells itself.
          </p>
        </header>
        <div class="blog-filters">
          <For each={categories}>
            {c => (
              <button
                class={`blog-filter${category() === c ? ' is-on' : ''}`}
                onClick={() => {
                  setCategory(c)
                  setPage(1)
                }}
              >
                {c}
              </button>
            )}
          </For>
        </div>
        <div class="blog-grid">
          <For each={shown()}>
            {p => (
              <article class="blog-card">
                <p class="blog-card-meta">
                  <i />
                  {p.category} · {p.readTime}
                </p>
                <h2 class="blog-card-title">
                  <A href={`/blog/${p.slug}`}>{p.title}</A>
                </h2>
                <p class="blog-card-excerpt">{p.excerpt}</p>
                <div class="blog-tags">
                  <For each={p.keywords}>
                    {x => (
                      <A href="/sign-up" class="blog-tag">
                        {x}
                      </A>
                    )}
                  </For>
                </div>
                <div class="blog-card-foot">
                  <span>{p.date}</span>
                  <A href={`/blog/${p.slug}`} class="blog-more">
                    Read →
                  </A>
                </div>
              </article>
            )}
          </For>
        </div>
        <Show when={pages() > 1}>
          <nav class="pg-root">
            <button class="pg-btn" disabled={page() === 1} onClick={() => setPage(page() - 1)}>
              ‹
            </button>
            <For each={Array.from({ length: pages() }, (_, i) => i + 1)}>
              {n => (
                <button
                  class={`pg-btn pg-page${page() === n ? ' is-on' : ''}`}
                  onClick={() => setPage(n)}
                >
                  <span class="pg-page-label">{n}</span>
                </button>
              )}
            </For>
            <button
              class="pg-btn"
              disabled={page() === pages()}
              onClick={() => setPage(page() + 1)}
            >
              ›
            </button>
          </nav>
        </Show>
        <section class="blog-panel blog-panel--split">
          <div>
            <p class="blog-panel-kicker">
              <i />
              Newsletter
            </p>
            <h2 class="blog-panel-title">New posts, every week.</h2>
          </div>
          <div>
            <Show
              when={subscribed()}
              fallback={
                <form class="blog-news-form" onSubmit={submit}>
                  <input
                    type="email"
                    required
                    value={email()}
                    onInput={e => setEmail(e.currentTarget.value)}
                    class="blog-news-input"
                    placeholder="you@company.com"
                  />
                  <button class="blog-news-submit">Subscribe</button>
                </form>
              }
            >
              <div class="blog-news-done">✓ Subscribed — check your inbox.</div>
            </Show>
            <Show when={error()}>
              <p class="blog-news-error">{error()}</p>
            </Show>
          </div>
        </section>
      </div>
    </>,
  )
}
