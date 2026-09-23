import { A, Navigate } from '@solidjs/router'
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  Copy,
  FileText,
  Menu,
  Moon,
  Sun,
  Terminal,
  X,
} from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import tabLogoB from '../../assets/tabLogoB.svg'
import { type Block, DOC_PAGES, findPage } from '../../docs/pages'
import { Seo } from '../core/Seo'
import { useTheme } from '../core/theme'
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
  let theme: ReturnType<typeof useTheme>
  try {
    theme = useTheme()
  } catch {
    theme = {
      theme: () =>
        typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
          ? 'dark'
          : 'light',
      setTheme: () => {},
      toggleTheme: () => {
        if (typeof document !== 'undefined') {
          const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.dataset.theme = next
          document.documentElement.classList.toggle('dark', next === 'dark')
        }
      },
    }
  }
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
            <header
              class="docs-top lb-nav lb-chrome"
              aria-label="Docs navigation"
              data-mobile-open={navOpen() || undefined}
            >
              <div class="lb-nav-in docs-top-in">
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
                  <a href="/llms.txt" target="_blank" rel="external noreferrer">
                    LLMs
                  </a>
                </nav>
                <div class="docs-top-right lb-nav-r">
                  <A href="/api-keys" class="lb-cta">
                    Get an API key
                  </A>
                  <button
                    type="button"
                    class="lb-mobile-toggle"
                    aria-label="Toggle navigation"
                    aria-expanded={navOpen()}
                    onClick={() => setNavOpen(!navOpen())}
                  >
                    {navOpen() ? <X size={16} /> : <Menu size={17} />}
                  </button>
                </div>
              </div>

              <Show when={navOpen()}>
                <div class="lb-mobile-menu">
                  <p class="lb-mobile-menu-label">Documentation</p>
                  <div class="lb-mobile-products">
                    <A
                      href="/docs/getting-started"
                      class={`lb-mobile-product ${p().slug === 'getting-started' || p().slug === '' ? 'is-active' : ''}`}
                      onClick={() => setNavOpen(false)}
                    >
                      <span class="lb-mobile-product-icon">
                        <BookOpen size={15} />
                      </span>
                      <span>Guide</span>
                    </A>

                    <A
                      href="/docs/mcp"
                      class={`lb-mobile-product ${p().slug === 'mcp' || p().slug === 'tools' ? 'is-active' : ''}`}
                      onClick={() => setNavOpen(false)}
                    >
                      <span class="lb-mobile-product-icon">
                        <Bot size={15} />
                      </span>
                      <span>AI Agents (MCP)</span>
                    </A>

                    <A
                      href="/docs/api"
                      class={`lb-mobile-product ${p().slug === 'api' ? 'is-active' : ''}`}
                      onClick={() => setNavOpen(false)}
                    >
                      <span class="lb-mobile-product-icon">
                        <Terminal size={15} />
                      </span>
                      <span>REST API</span>
                    </A>

                    <a
                      href="/llms.txt"
                      target="_blank"
                      rel="external noreferrer"
                      class="lb-mobile-product"
                      onClick={() => setNavOpen(false)}
                    >
                      <span class="lb-mobile-product-icon">
                        <FileText size={15} />
                      </span>
                      <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '3px' }}>
                        LLMs <ArrowUpRight size={11} />
                      </span>
                    </a>
                  </div>

                  <div class="docs-mobile-nav-tree">
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

                  <div class="lb-mobile-appearance">
                    <span>Appearance</span>
                    <button type="button" onClick={theme.toggleTheme}>
                      {theme.theme() === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                      {theme.theme() === 'dark' ? 'Light' : 'Dark'} theme
                    </button>
                  </div>
                </div>
              </Show>
            </header>

            <Portal>
              <button
                type="button"
                class="lb-mobile-scrim"
                data-open={navOpen() || undefined}
                aria-hidden={!navOpen()}
                tabIndex={navOpen() ? 0 : -1}
                onClick={() => setNavOpen(false)}
              />
            </Portal>

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
