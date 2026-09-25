import { A, useNavigate } from '@solidjs/router'
import { ChevronDown, Menu, Moon, Sun, X } from 'lucide-solid'
import { createEffect, createSignal, createUniqueId, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import tabLogoB from '../../assets/tabLogoB.svg'
import { useAuth } from '../core/auth'
import { useTheme } from '../core/theme'
import { PitchLogoAnimation } from './brand'
import { SOCIALS } from './LandingFooter'
import { McpSetup } from './McpSetup'
import { PRODUCTS, ProductGlyph } from './productCatalog'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'

const signedIn = (auth: ReturnType<typeof useAuth>) =>
  typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn

const ProductMenu = () => {
  const [open, setOpen] = createSignal(false),
    [top, setTop] = createSignal(0)
  let wrap!: HTMLDivElement
  let timer: number | undefined
  const cancel = () => clearTimeout(timer),
    close = () => {
      cancel()
      timer = window.setTimeout(() => setOpen(false), 90)
    }
  createEffect(() => {
    if (!open()) return
    const measure = () =>
      setTop(Math.max(0, wrap.closest('nav')?.getBoundingClientRect().bottom ?? 0))
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const click = (e: MouseEvent) => !wrap.contains(e.target as Node) && setOpen(false)
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    document.addEventListener('keydown', key)
    document.addEventListener('mousedown', click)
    onCleanup(() => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      document.removeEventListener('keydown', key)
      document.removeEventListener('mousedown', click)
    })
  })
  const id = createUniqueId()
  return (
    <>
      <div
        ref={wrap}
        class="lb-nav-mega"
        data-open={open() || undefined}
        onMouseEnter={() => {
          cancel()
          setOpen(true)
        }}
        onMouseLeave={close}
      >
        <button
          type="button"
          class="lb-nav-link"
          aria-haspopup="true"
          aria-expanded={open()}
          aria-controls={id}
          onClick={() => setOpen(!open())}
          onFocus={() => setOpen(true)}
        >
          Product <ChevronDown class="lb-nav-caret" size={13} />
        </button>
        <div id={id} class="lb-mega-panel" role="menu">
          <p class="lb-mega-head">What you can make</p>
          <div class="lb-mega-grid">
            <For each={PRODUCTS}>
              {p => (
                <A
                  href={`/product/${p.slug}`}
                  role="menuitem"
                  class="lb-mega-item"
                  onClick={() => setOpen(false)}
                >
                  <span class="lb-mega-ico">
                    <ProductGlyph icon={p.icon} size={15} />
                  </span>
                  <span class="lb-mega-copy">
                    <span class="lb-mega-name">
                      {p.name}
                      <Show when={p.badge}>
                        <span class="lb-mega-badge">{p.badge}</span>
                      </Show>
                    </span>
                    <span class="lb-mega-desc">{p.nav}</span>
                  </span>
                </A>
              )}
            </For>
          </div>
          <div class="lb-mega-foot">
            <span>One agent. Any brief. Any format.</span>
            <A href="/#work" onClick={() => setOpen(false)}>
              See the work
            </A>
          </div>
        </div>
      </div>
      <Portal>
        <div
          class="lb-mega-scrim"
          data-open={open() || undefined}
          style={{ top: `${top()}px` }}
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      </Portal>
    </>
  )
}

export const LandingNav = () => {
  const auth = useAuth(),
    theme = useTheme(),
    navigate = useNavigate(),
    [mcpOpen, setMcpOpen] = createSignal(false),
    [mobileOpen, setMobileOpen] = createSignal(false)
  const id = createUniqueId()
  let button!: HTMLButtonElement
  const closeMobile = () => {
    setMobileOpen(false)
    queueMicrotask(() => button.focus())
  }
  createEffect(() => {
    if (!mobileOpen()) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobile()
      }
    }
    const resize = () => innerWidth > 880 && setMobileOpen(false)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', resize)
    onCleanup(() => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', resize)
    })
  })
  createEffect(() => {
    if (!mcpOpen()) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMcpOpen(false)
    document.addEventListener('keydown', key)
    onCleanup(() => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', key)
    })
  })
  return (
    <>
      <nav
        class="lb-nav lb-chrome"
        aria-label="Main navigation"
        data-mobile-open={mobileOpen() || undefined}
      >
        <div class="lb-nav-in">
          <A href="/" class="lb-brand" aria-label="Pitch home">
            <img src={tabLogoB} alt="" class="lb-brand-mark" width="32" height="32" />
            <span class="lb-brand-word">
              <PitchLogoAnimation startAnimation={false} />
              <span class="lb-brand-by">AI Production Studio</span>
            </span>
          </A>
          <div class="lb-nav-center">
            <ProductMenu />
            <A href="/pricing" class="lb-nav-link">
              Pricing
            </A>
            <A href="/affiliates" class="lb-nav-link">
              Affiliates
            </A>
            <A href="/AgenC" class="lb-nav-link">
              Need an epic launch video?
            </A>
            <button type="button" class="lb-nav-link" onClick={() => setMcpOpen(true)}>
              API / MCP
            </button>
          </div>
          <div class="lb-nav-r">
            <div class="lb-nav-social">
              <For each={SOCIALS}>
                {social => (
                  <a href={social.href} target="_blank" rel="noreferrer" aria-label={social.label}>
                    {social.icon?.({ size: 15 })}
                  </a>
                )}
              </For>
            </div>
            <button
              type="button"
              class="lb-theme-toggle lb-theme-toggle--desktop"
              aria-label={`Switch to ${theme.theme() === 'dark' ? 'light' : 'dark'} theme`}
              aria-pressed={theme.theme() === 'dark'}
              onClick={theme.toggleTheme}
            >
              {theme.theme() === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <A href={signedIn(auth) ? '/new' : '/sign-up'} class="lb-cta">
              {signedIn(auth) ? 'Dashboard' : 'Get started'}
            </A>
            <button
              ref={button}
              type="button"
              class="lb-mobile-toggle"
              aria-expanded={mobileOpen()}
              aria-controls={id}
              onClick={() => setMobileOpen(!mobileOpen())}
            >
              {mobileOpen() ? <X size={16} /> : <Menu size={17} />}
            </button>
          </div>
        </div>
      </nav>
      <Show when={mobileOpen()}>
        <Portal>
          <button
            type="button"
            class="lb-mobile-scrim lb-mobile-scrim--landing"
            aria-label="Close navigation"
            onClick={closeMobile}
          />
          <div id={id} class="lb-mobile-menu lb-mobile-menu--landing lb-chrome">
            <p class="lb-mobile-menu-label">Product</p>
            <div class="lb-mobile-products">
              <For each={PRODUCTS}>
                {p => (
                  <A href={`/product/${p.slug}`} class="lb-mobile-product" onClick={closeMobile}>
                    <span class="lb-mobile-product-icon">
                      <ProductGlyph icon={p.icon} />
                    </span>
                    <span>{p.name}</span>
                  </A>
                )}
              </For>
            </div>
            <div class="lb-mobile-links">
              <A href="/pricing" onClick={closeMobile}>
                Pricing
              </A>
              <A href="/affiliates" onClick={closeMobile}>
                Affiliates
              </A>
              <A href="/AgenC" onClick={closeMobile}>
                Need an epic launch video?
              </A>
              <button
                onClick={() => {
                  setMobileOpen(false)
                  setMcpOpen(true)
                }}
              >
                API / MCP
              </button>
            </div>
            <div class="lb-mobile-appearance">
              <span>Appearance</span>
              <button type="button" onClick={theme.toggleTheme}>
                {theme.theme() === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme.theme() === 'dark' ? 'Light' : 'Dark'} theme
              </button>
            </div>
            <div class="lb-mobile-socials">
              <span>Follow</span>
              <div>
                <For each={SOCIALS}>
                  {s => (
                    <a href={s.href} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
      <Show when={mcpOpen()}>
        <Portal>
          <div
            class="mcp-modal lb-chrome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-modal-title"
          >
            <button class="mcp-modal-scrim" aria-label="Close" onClick={() => setMcpOpen(false)} />
            <div class="mcp-modal-card">
              <div class="mcp-modal-head">
                <div class="mcp-modal-head-copy">
                  <p class="lb-chy">MCP · API</p>
                  <h2 id="mcp-modal-title">Set up your AI agent</h2>
                </div>
                <button class="mcp-modal-x" onClick={() => setMcpOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div class="mcp-modal-body">
                <McpSetup instant />
                <div class="mcp-cta">
                  <button
                    class="lb-cta"
                    onClick={() => {
                      setMcpOpen(false)
                      navigate('/api-keys')
                    }}
                  >
                    Get an API key
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
