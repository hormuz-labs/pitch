import { A, useParams } from '@solidjs/router'
import { ArrowUpRight, ExternalLink } from 'lucide-solid'
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js'
import { useAuth } from '../core/auth'
import { Seo, SITE_URL } from '../core/Seo'
import { BLOG_POSTS, type Block, CATEGORIES, type Post } from './blogPosts'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/blog.css'

export { BLOG_POSTS } from './blogPosts'

const isSignedIn = (auth: ReturnType<typeof useAuth>) =>
  typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

// Signed-out visitors get the full landing root (it paints the page); signed-in
// ones still need the --lb-* tokens, which `.lb-chrome` carries without painting.
// The site nav and footer show for everyone: the nav swaps its CTA to
// "Dashboard" when signed in, so a reader always has a way around.
const shell = (auth: ReturnType<typeof useAuth>, children: JSX.Element) => (
  <div class={`min-h-screen flex flex-col ${isSignedIn(auth) ? 'lb-chrome blog-page' : 'lb-root'}`}>
    <LandingNav />
    {children}
    <LandingFooter />
  </div>
)

type Segment = { block: Block } | { fit: { title: string; items: string[] }[] }

/**
 * "When Pitch fits" and "When to use another tool", each a heading and a list,
 * read best side by side; everything else renders in order.
 */
const segments = (body: Block[]): Segment[] => {
  const out: Segment[] = []
  for (let i = 0; i < body.length; i++) {
    const [h1, l1, h2, l2] = body.slice(i, i + 4)
    if (
      h1 &&
      'h' in h1 &&
      h1.h.startsWith('When Pitch fits') &&
      l1 &&
      'list' in l1 &&
      h2 &&
      'h' in h2 &&
      h2.h.startsWith('When to use') &&
      l2 &&
      'list' in l2
    ) {
      out.push({
        fit: [
          { title: h1.h, items: l1.list },
          { title: h2.h, items: l2.list },
        ],
      })
      i += 3
    } else out.push({ block: body[i] })
  }
  return out
}

/** Renders `[label](href)` links inside otherwise plain copy. */
const Inline = (props: { text: string }) => {
  const parts = () => props.text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return (
    <For each={parts()}>
      {part => {
        const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (!m) return part
        return m[2].startsWith('/') ? (
          <A href={m[2]}>{m[1]}</A>
        ) : (
          <a href={m[2]} target="_blank" rel="noopener noreferrer">
            {m[1]}
          </a>
        )
      }}
    </For>
  )
}

const BlockView = (props: { block: Block }) => {
  const b = props.block
  if ('h' in b) return <h2>{b.h}</h2>
  if ('p' in b)
    return (
      <p>
        <Inline text={b.p} />
      </p>
    )
  if ('prompt' in b)
    return (
      <figure class="blog-prompt">
        <figcaption>Prompt</figcaption>
        <blockquote>{b.prompt}</blockquote>
      </figure>
    )
  if ('table' in b)
    return (
      <div class="blog-table-wrap">
        <table class="blog-table">
          <thead>
            <tr>
              <For each={b.table.head}>{c => <th scope="col">{c}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={b.table.rows}>
              {row => (
                <tr>
                  <For each={row}>
                    {(c, i) => (i() === 0 ? <th scope="row">{c}</th> : <td>{c}</td>)}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    )
  const items = (
    <For each={b.list}>
      {x => (
        <li>
          <Inline text={x} />
        </li>
      )}
    </For>
  )
  return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
}

const postJsonLd = (p: Post) => {
  const url = `${SITE_URL}/blog/${p.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: p.title,
        description: p.excerpt,
        datePublished: p.date,
        dateModified: p.date,
        articleSection: p.category,
        image: `${SITE_URL}/og/blog/${p.slug}.png`,
        mainEntityOfPage: url,
        author: { '@id': `${SITE_URL}/#org` },
        publisher: { '@id': `${SITE_URL}/#org` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: p.title, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: p.faq.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }
}

const Arrow = () => <span aria-hidden="true">→</span>

const PostRow = (props: { post: Post }) => (
  <article class="blog-row">
    <p class="blog-row-cat">
      <i />
      {props.post.category}
    </p>
    <div class="blog-row-main">
      <h2 class="blog-row-title">
        <A href={`/blog/${props.post.slug}`}>{props.post.title}</A>
      </h2>
      <p class="blog-row-excerpt">{props.post.excerpt}</p>
    </div>
    <span class="blog-row-more">
      Read guide <Arrow />
    </span>
  </article>
)

export const BlogPostView = () => {
  const auth = useAuth(),
    params = useParams(),
    post = () => BLOG_POSTS.find(p => p.slug === params.slug),
    related = () => {
      const p = post()
      if (!p) return []
      const same = BLOG_POSTS.filter(x => x.slug !== p.slug && x.category === p.category)
      const rest = BLOG_POSTS.filter(x => x.slug !== p.slug && x.category !== p.category)
      return [...same, ...rest].slice(0, 3)
    }
  return shell(
    auth,
    <Show
      when={post()}
      fallback={
        <div class="blog-shell">
          <A href="/blog" class="blog-back">
            ← Pitch Blog
          </A>
          <h1 class="blog-post-title">Post not found.</h1>
        </div>
      }
    >
      {p => (
        <>
          <Seo
            title={p().title.length > 50 ? p().title : `${p().title} | Pitch`}
            description={p().excerpt}
            path={`/blog/${p().slug}`}
            image={`${SITE_URL}/og/blog/${p().slug}.png`}
            jsonLd={postJsonLd(p())}
          />
          <div class="blog-shell blog-post">
            <nav class="blog-crumbs" aria-label="Breadcrumb">
              <A href="/blog">← Blog</A>
            </nav>
            <div class="blog-post-grid">
              <article class="blog-post-main">
                <header class="blog-post-head">
                  <p class="blog-post-meta">
                    <i />
                    {p().category} · Updated <time datetime={p().date}>{formatDate(p().date)}</time>{' '}
                    · {p().readTime}
                  </p>
                  <h1 class="blog-post-title">{p().title}</h1>
                  <p class="blog-post-lede">{p().excerpt}</p>
                </header>

                <section class="blog-answer" aria-labelledby="direct-answer">
                  <h2 id="direct-answer">Direct answer</h2>
                  <For each={p().answer}>{x => <p>{x}</p>}</For>
                </section>

                <div class="blog-post-body">
                  <For each={segments(p().body)}>
                    {seg =>
                      'fit' in seg ? (
                        <div class="blog-fit">
                          <For each={seg.fit}>
                            {card => (
                              <section class="blog-fit-card">
                                <h2>{card.title}</h2>
                                <ul>
                                  <For each={card.items}>
                                    {x => (
                                      <li>
                                        <Inline text={x} />
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </section>
                            )}
                          </For>
                        </div>
                      ) : (
                        <BlockView block={seg.block} />
                      )
                    }
                  </For>

                  <h2>FAQ</h2>
                  <div class="blog-faq">
                    <For each={p().faq}>
                      {([q, a]) => (
                        <div class="blog-faq-item">
                          <h3>{q}</h3>
                          <p>{a}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </article>

              <aside class="blog-aside" aria-label="About this guide">
                <section class="blog-aside-card">
                  <p class="blog-aside-label">Question answered</p>
                  <p class="blog-aside-copy">{p().question}</p>
                </section>
                <section class="blog-aside-card">
                  <p class="blog-aside-label">Primary sources</p>
                  <ul class="blog-aside-links">
                    <For each={p().sources}>
                      {s =>
                        s.href.startsWith('/') ? (
                          <li>
                            <A href={s.href}>
                              {s.label}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </A>
                          </li>
                        ) : (
                          <li>
                            <a href={s.href} target="_blank" rel="noopener noreferrer">
                              {s.label}
                              <ExternalLink size={14} aria-hidden="true" />
                            </a>
                          </li>
                        )
                      }
                    </For>
                  </ul>
                </section>
                <section class="blog-aside-card">
                  <p class="blog-aside-label">About Pitch</p>
                  <p class="blog-aside-copy">
                    Pitch is an AI production studio you direct by chat. It researches, records your
                    real product, writes, narrates and edits launch films, demos, decks and video
                    edits in one conversation.
                  </p>
                  <A href={isSignedIn(auth) ? '/new' : '/sign-up'} class="blog-aside-cta">
                    Start a project <Arrow />
                  </A>
                </section>
              </aside>
            </div>

            <section class="blog-related">
              <p class="blog-related-label">Keep reading</p>
              <div class="blog-list">
                <For each={related()}>{r => <PostRow post={r} />}</For>
              </div>
            </section>
          </div>
        </>
      )}
    </Show>,
  )
}

export const Blog = () => {
  const auth = useAuth(),
    [category, setCategory] = createSignal('All'),
    [email, setEmail] = createSignal(''),
    [subscribed, setSubscribed] = createSignal(false),
    [error, setError] = createSignal('')
  const sorted = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date))
  const filtered = createMemo(() =>
    category() === 'All' ? sorted : sorted.filter(p => p.category === category()),
  )
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
        title="Pitch Blog: guides for AI launch videos, demos and decks"
        description="Direct answers and honest comparisons for making launch videos, product demos, pitch decks and video edits with AI."
        path="/blog"
      />
      <div class="blog-shell blog-index">
        <header class="blog-head">
          <p class="lb-chy">Pitch Blog</p>
          <h1 class="blog-title">Answers for AI video, demos and decks</h1>
          <p class="blog-lede">
            Practical guides and straight comparisons: which tool fits which job, how to brief an
            agent, and when Pitch is the wrong pick.
          </p>
        </header>
        <div class="blog-filters" role="tablist" aria-label="Filter by category">
          <For each={['All', ...CATEGORIES]}>
            {c => (
              <button
                type="button"
                role="tab"
                aria-selected={category() === c}
                class={`blog-filter${category() === c ? ' is-on' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            )}
          </For>
        </div>
        <div class="blog-list">
          <For each={filtered()} fallback={<p class="blog-empty">No guides here yet.</p>}>
            {p => <PostRow post={p} />}
          </For>
        </div>
        <section class="blog-panel blog-panel--split">
          <div>
            <p class="blog-panel-kicker">
              <i />
              Newsletter
            </p>
            <h2 class="blog-panel-title">New guides, when they ship.</h2>
          </div>
          <div>
            <Show
              when={subscribed()}
              fallback={
                <form class="blog-news-form" onSubmit={submit}>
                  <input
                    type="email"
                    required
                    aria-label="Email address"
                    value={email()}
                    onInput={e => setEmail(e.currentTarget.value)}
                    class="blog-news-input"
                    placeholder="you@company.com"
                  />
                  <button class="blog-news-submit">Subscribe</button>
                </form>
              }
            >
              <div class="blog-news-done">✓ Subscribed. Check your inbox.</div>
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
