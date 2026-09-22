import { A, Navigate } from '@solidjs/router'
import { Check, Copy, Menu, X } from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import tabLogoB from '../../assets/tabLogoB.svg'
import { type Block, DOC_PAGES, findPage } from '../../docs/pages'
import { Seo } from '../core/Seo'
import { PitchLogoAnimation } from './brand'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'
import '../../styles/docs.css'

const anchor = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const legacy = (node: any): any => {
  if (node == null || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(legacy)
  if (typeof node === 'function') return legacy(node())
  if (typeof Node !== 'undefined' && node instanceof Node) return node.cloneNode(true)
  if (node?.props) {
    if (typeof node.type === 'function') return legacy(node.type(node.props))
    if (typeof node.type === 'symbol') return legacy(node.props.children)
    const props = { ...node.props }
    delete props.children
    delete props.key
    if (props.className) {
      props.class = props.className
      delete props.className
    }
    return (
      <Dynamic component={node.type} {...props}>
        {legacy(node.props.children)}
      </Dynamic>
    )
  }
  return node
}
const CodeBlock = (props: { code: string; lang?: string }) => {
  const [copied, setCopied] = createSignal(false)
  return (
    <div class="docs-code">
      <div class="docs-code-bar">
        <span>{props.lang ?? 'text'}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(props.code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied() ? <Check size={13} /> : <Copy size={13} />} {copied() ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{props.code}</code>
      </pre>
    </div>
  )
}
const BlockView = (props: { block: Block }) => {
  const b: any = props.block
  return b.k === 'h2' ? (
    <h2 id={anchor(b.text)}>
      <a href={`#${anchor(b.text)}`}>#</a>
      {b.text}
    </h2>
  ) : b.k === 'h3' ? (
    <h3 id={anchor(b.text)}>{b.text}</h3>
  ) : b.k === 'p' ? (
    <p>{legacy(b.text)}</p>
  ) : b.k === 'code' ? (
    <CodeBlock code={b.code} lang={b.lang} />
  ) : b.k === 'note' ? (
    <div class="docs-note">{legacy(b.text)}</div>
  ) : b.k === 'list' ? (
    <Dynamic component={b.ordered ? 'ol' : 'ul'} class="docs-list">
      <For each={b.items}>{(x: any) => <li>{legacy(x)}</li>}</For>
    </Dynamic>
  ) : (
    <div class="docs-table-wrap">
      <table class="docs-table">
        <thead>
          <tr>
            <For each={b.head}>{(x: any) => <th>{legacy(x)}</th>}</For>
          </tr>
        </thead>
        <tbody>
          <For each={b.rows}>
            {(r: any[]) => (
              <tr>
                <For each={r}>{x => <td>{legacy(x)}</td>}</For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}
export const DocsView = (props: { slug?: string }) => {
  const [navOpen, setNavOpen] = createSignal(false)
  const page = () => findPage(props.slug ?? '')
  createEffect(() => {
    props.slug
    setNavOpen(false)
    scrollTo(0, 0)
  })
  createEffect(() => {
    if (!navOpen()) return
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    onCleanup(() => (document.body.style.overflow = old))
  })
  return (
    <Show when={page()} fallback={<Navigate href="/docs" />}>
      {p => {
        const pages = DOC_PAGES,
          index = pages.indexOf(p())
        return (
          <div class="lb-root docs-root">
            <Seo
              title={`${p().title} — Pitch docs`}
              description={p().lede}
              path={p().slug ? `/docs/${p().slug}` : '/docs'}
            />
            <header class="docs-top">
              <A href="/" class="lb-brand docs-brand">
                <img src={tabLogoB} class="lb-brand-mark" width="28" height="28" alt="" />
                <span class="lb-brand-word">
                  <PitchLogoAnimation startAnimation={false} />
                  <span class="lb-brand-by">A Frontier Agent</span>
                </span>
              </A>
              <nav class="docs-top-links">
                <A href="/docs/getting-started">Guide</A>
                <A href="/docs/mcp">AI Agents (MCP)</A>
                <A href="/docs/api">API Reference</A>
                <a href="/llms.txt">LLMs</a>
              </nav>
              <div class="docs-top-right">
                <A href="/api-keys" class="lb-cta">
                  Get an API key
                </A>
                <button
                  class="docs-menu-btn"
                  aria-label="Toggle navigation"
                  aria-expanded={navOpen()}
                  onClick={() => setNavOpen(!navOpen())}
                >
                  {navOpen() ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </header>

            <Show when={navOpen()}>
              <Portal>
                <div
                  class="docs-mobile-drawer lb-chrome"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Docs navigation"
                >
                  <div class="docs-mobile-drawer-head">
                    <A href="/" class="lb-brand docs-brand" onClick={() => setNavOpen(false)}>
                      <img src={tabLogoB} class="lb-brand-mark" width="28" height="28" alt="" />
                      <span class="lb-brand-word">
                        <PitchLogoAnimation startAnimation={false} />
                      </span>
                    </A>
                    <button
                      type="button"
                      class="docs-mobile-close-btn"
                      aria-label="Close navigation"
                      onClick={() => setNavOpen(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div class="docs-mobile-drawer-body">
                    <div class="docs-mobile-top-links">
                      <A href="/docs/getting-started" onClick={() => setNavOpen(false)}>
                        Guide
                      </A>
                      <A href="/docs/mcp" onClick={() => setNavOpen(false)}>
                        AI Agents (MCP)
                      </A>
                      <A href="/docs/api" onClick={() => setNavOpen(false)}>
                        API Reference
                      </A>
                      <a href="/llms.txt">LLMs</a>
                    </div>
                    <div class="docs-mobile-cta-wrap">
                      <A href="/api-keys" class="lb-cta" onClick={() => setNavOpen(false)}>
                        Get an API key
                      </A>
                    </div>
                    <div class="docs-mobile-nav-groups">
                      <For each={['Guide', 'Reference']}>
                        {group => (
                          <div class="docs-side-group">
                            <p class="docs-side-title">{group}</p>
                            <For each={pages.filter(x => x.group === group)}>
                              {x => (
                                <A
                                  class={`docs-side-link${x.slug === p().slug ? ' is-on' : ''}`}
                                  href={x.slug ? `/docs/${x.slug}` : '/docs'}
                                  onClick={() => setNavOpen(false)}
                                >
                                  {x.nav}
                                </A>
                              )}
                            </For>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </Portal>
            </Show>

            <div class="docs-shell">
              <aside class="docs-side">
                <For each={['Guide', 'Reference']}>
                  {group => (
                    <div class="docs-side-group">
                      <p class="docs-side-title">{group}</p>
                      <For each={pages.filter(x => x.group === group)}>
                        {x => (
                          <A
                            class={`docs-side-link${x.slug === p().slug ? ' is-on' : ''}`}
                            href={x.slug ? `/docs/${x.slug}` : '/docs'}
                          >
                            {x.nav}
                          </A>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </aside>
              <main class="docs-body">
                <p class="lb-chy">{p().group}</p>
                <h1>{p().title}</h1>
                <p class="docs-lede">{p().lede}</p>
                <For each={p().blocks}>{b => <BlockView block={b} />}</For>
                <nav class="docs-pager">
                  {pages[index - 1] ? (
                    <A href={`/docs/${pages[index - 1].slug}`}>
                      <span>Previous</span>
                      {pages[index - 1].title}
                    </A>
                  ) : (
                    <span />
                  )}
                  {pages[index + 1] && (
                    <A class="is-next" href={`/docs/${pages[index + 1].slug}`}>
                      <span>Next</span>
                      {pages[index + 1].title}
                    </A>
                  )}
                </nav>
              </main>
              <aside class="docs-toc">
                <p class="docs-toc-title">On this page</p>
                <For each={p().blocks.filter((b: any) => b.k === 'h2') as any[]}>
                  {h => <a href={`#${anchor(h.text)}`}>{h.text}</a>}
                </For>
              </aside>
            </div>
          </div>
        )
      }}
    </Show>
  )
}
