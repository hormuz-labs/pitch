/**
 * DocsView — the /docs/* site. Sidebar, content, and an on-this-page rail
 * derived from the h2 blocks in docs/pages.tsx. Rendered standalone, the same
 * way `/` and `/product/:slug` are.
 */
import { Check, Copy, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import tabLogoB from '../assets/tabLogoB.svg'
import { PitchLogoAnimation } from '../components/PitchLogoAnimation'
import { Seo } from '../components/Seo'
import { type Block, DOC_PAGES, findPage } from '../docs/pages'
import '../styles/landing.css'
import '../styles/landing-broadcast.css'
import '../styles/docs.css'

const escapeCode = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const syntaxToken =
  /(^[ \t]*#[^\n]*|^[ \t]*\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\$\{[^}]+\}|\$[A-Za-z_][\w]*|\b(?:async|await|break|case|catch|class|const|continue|curl|default|delete|do|else|export|extends|false|finally|for|from|function|get|if|import|in|instanceof|let|new|null|patch|post|return|set|static|switch|throw|true|try|typeof|var|while)\b|\b\d+(?:\.\d+)?\b)/gim

const tokenClass = (token: string) => {
  const trimmed = token.trimStart()
  if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
    return 'hljs-comment'
  }
  if (/^["'`]/.test(token)) return 'hljs-string'
  if (token.startsWith('$')) return 'hljs-variable'
  if (/^\d/.test(token)) return 'hljs-number'
  if (/^(true|false|null)$/i.test(token)) return 'hljs-literal'
  return 'hljs-keyword'
}

const highlightedCode = (code: string, lang?: string) => {
  if (!lang || lang === 'text') return null

  let cursor = 0
  let html = ''
  for (const match of code.matchAll(syntaxToken)) {
    const index = match.index ?? 0
    html += escapeCode(code.slice(cursor, index))
    html += `<span class="${tokenClass(match[0])}">${escapeCode(match[0])}</span>`
    cursor = index + match[0].length
  }
  return html + escapeCode(code.slice(cursor))
}

const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const CodeBlock = ({ code, lang }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false)
  const highlighted = highlightedCode(code, lang)
  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="docs-code">
      <div className="docs-code-bar">
        <span>{lang ?? 'text'}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        {highlighted ? (
          <code
            className={`hljs language-${lang}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  )
}

const renderBlock = (b: Block, i: number) => {
  switch (b.k) {
    case 'h2':
      return (
        <h2 key={i} id={anchor(b.text)}>
          <a href={`#${anchor(b.text)}`} aria-label={`Link to ${b.text}`}>
            #
          </a>
          {b.text}
        </h2>
      )
    case 'h3':
      return (
        <h3 key={i} id={anchor(b.text)}>
          {b.text}
        </h3>
      )
    case 'p':
      return <p key={i}>{b.text}</p>
    case 'code':
      return <CodeBlock key={i} code={b.code} lang={b.lang} />
    case 'note':
      return (
        <div key={i} className="docs-note">
          {b.text}
        </div>
      )
    case 'list':
      return b.ordered ? (
        <ol key={i} className="docs-list">
          {b.items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ol>
      ) : (
        <ul key={i} className="docs-list">
          {b.items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div key={i} className="docs-table-wrap">
          <table className="docs-table">
            {b.head.some(Boolean) && (
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j}>{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {b.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export const DocsView = ({ slug = '' }: { slug?: string }) => {
  const [navOpen, setNavOpen] = useState(false)
  const [activeId, setActiveId] = useState('')
  const page = findPage(slug)

  // Close the mobile sidebar and jump to the top on navigation.
  useEffect(() => {
    setNavOpen(false)
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [slug])

  // The mobile navigation is a viewport sheet. Keep the article from moving
  // behind it and support the same Escape-to-close behavior as a dialog.
  useEffect(() => {
    if (!navOpen) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [navOpen])

  // Highlight the heading nearest the top of the viewport.
  useEffect(() => {
    if (!page) return
    const headings = Array.from(document.querySelectorAll<HTMLElement>('.docs-body h2'))
    if (!headings.length) return
    const onScroll = () => {
      const top = headings.filter(h => h.getBoundingClientRect().top <= 120).pop()
      setActiveId(top?.id ?? headings[0].id)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [page])

  if (!page) return <Navigate to="/docs" replace />

  const toc = page.blocks.filter((b): b is Extract<Block, { k: 'h2' }> => b.k === 'h2')
  const groups = ['Guide', 'Reference'] as const
  const index = DOC_PAGES.indexOf(page)
  const prev = DOC_PAGES[index - 1]
  const next = DOC_PAGES[index + 1]
  const href = (s: string) => (s ? `/docs/${s}` : '/docs')

  return (
    <>
      <Seo title={`${page.title} — Pitch docs`} description={page.lede} path={href(page.slug)} />

      <div className="lb-root docs-root">
        <header className="docs-top">
          <Link to="/" className="lb-brand docs-brand" aria-label="Pitch home">
            <img src={tabLogoB} alt="" className="lb-brand-mark" width={26} height={26} />
            <span className="lb-brand-word">
              <PitchLogoAnimation startAnimation={false} loop={false} color="currentColor" />
              <span className="lb-brand-by">A Frontier Agent</span>
            </span>
          </Link>

          <nav className="docs-top-links" aria-label="Docs sections">
            <Link to="/docs/getting-started">Guide</Link>
            <Link to="/docs/mcp">AI Agents (MCP)</Link>
            <Link to="/docs/api">API Reference</Link>
            <a href="/llms.txt">LLMs</a>
          </nav>

          <div className="docs-top-right">
            {/* Theme toggle intentionally hidden while docs are light-only. */}
            <Link to="/api-keys" className="lb-cta">
              Get an API key
            </Link>
            <button
              type="button"
              className="docs-menu-btn"
              onClick={() => setNavOpen(v => !v)}
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={navOpen}
              aria-controls="docs-mobile-navigation"
            >
              {navOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </header>

        <div className="docs-shell">
          <aside id="docs-mobile-navigation" className={`docs-side${navOpen ? ' is-open' : ''}`}>
            {groups.map(group => (
              <div key={group} className="docs-side-group">
                <p className="docs-side-title">{group}</p>
                {DOC_PAGES.filter(p => p.group === group).map(p => (
                  <Link
                    key={p.slug}
                    to={href(p.slug)}
                    className={`docs-side-link${p.slug === page.slug ? ' is-on' : ''}`}
                  >
                    {p.nav}
                  </Link>
                ))}
              </div>
            ))}
            <div className="docs-side-group">
              <p className="docs-side-title">Machine readable</p>
              <a className="docs-side-link" href="/openapi.json">
                OpenAPI Spec
              </a>
              <a className="docs-side-link" href="/llms.txt">
                llms.txt
              </a>
              <a className="docs-side-link" href="/llms-full.txt">
                llms-full.txt
              </a>
            </div>
          </aside>

          <main className="docs-body">
            <p className="lb-chy">{page.group}</p>
            <h1>{page.title}</h1>
            <p className="docs-lede">{page.lede}</p>
            {page.blocks.map(renderBlock)}

            <nav className="docs-pager" aria-label="Page navigation">
              {prev ? (
                <Link to={href(prev.slug)}>
                  <span>Previous</span>
                  {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link to={href(next.slug)} className="is-next">
                  <span>Next</span>
                  {next.title}
                </Link>
              )}
            </nav>
          </main>

          <aside className="docs-toc" aria-label="On this page">
            {toc.length > 0 && (
              <>
                <p className="docs-toc-title">On this page</p>
                {toc.map(h => (
                  <a
                    key={h.text}
                    href={`#${anchor(h.text)}`}
                    className={activeId === anchor(h.text) ? 'is-on' : undefined}
                  >
                    {h.text}
                  </a>
                ))}
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
