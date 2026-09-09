import { A, useNavigate } from '@solidjs/router'
import { ChevronDown, Menu, X } from 'lucide-solid'
import { createEffect, createSignal, createUniqueId, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import tabLogoB from '../../assets/tabLogoB.svg'
import { useAuth } from '../core/auth'
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
            <span>One agent. Idea to finished cut.</span>
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
    navigate = useNavigate(),
    [mcpOpen, setMcpOpen] = createSignal(false),
    [mobileOpen, setMobileOpen] = createSignal(false)
  const id = createUniqueId()
  let button!: HTMLButtonElement
  createEffect(() => {
    if (!mobileOpen()) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        button.focus()
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
      <div class="landing-announcement lb-chrome" role="banner">
        <span>$5 in render credits when you sign up</span>
        <A href="/sign-up" class="landing-announcement-cta">
          Claim
        </A>
      </div>
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
              <span class="lb-brand-by">A Frontier Agent</span>
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
            <button type="button" class="lb-nav-link" onClick={() => setMcpOpen(true)}>
              API / MCP
            </button>
            <A href="/docs" class="lb-nav-link">
              Docs
            </A>
          </div>
          <div class="lb-nav-r">
            <div class="lb-nav-social">
              <For each={SOCIALS}>
                {social => (
                  <a href={social.href} target="_blank" rel="noreferrer" aria-label={social.label}>
                    {social.label.slice(0, 1)}
                  </a>
                )}
              </For>
            </div>
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
        <Show when={mobileOpen()}>
          <div id={id} class="lb-mobile-menu">
            <p class="lb-mobile-menu-label">Product</p>
            <div class="lb-mobile-products">
              <For each={PRODUCTS}>
                {p => (
                  <A
                    href={`/product/${p.slug}`}
                    class="lb-mobile-product"
                    onClick={() => setMobileOpen(false)}
                  >
                    <span class="lb-mobile-product-icon">
                      <ProductGlyph icon={p.icon} />
                    </span>
                    <span>{p.name}</span>
                  </A>
                )}
              </For>
            </div>
            <div class="lb-mobile-links">
              <A href="/pricing">Pricing</A>
              <A href="/affiliates">Affiliates</A>
              <button
                onClick={() => {
                  setMobileOpen(false)
                  setMcpOpen(true)
                }}
              >
                API / MCP
              </button>
              <A href="/docs">Docs</A>
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
        </Show>
      </nav>
      <Portal>
        <button
          type="button"
          class="lb-mobile-scrim"
          data-open={mobileOpen() || undefined}
          aria-hidden={!mobileOpen()}
          tabIndex={mobileOpen() ? 0 : -1}
          onClick={() => setMobileOpen(false)}
        />
      </Portal>
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
