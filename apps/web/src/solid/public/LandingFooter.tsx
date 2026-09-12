import { A } from '@solidjs/router'
import { For, type JSX, onMount } from 'solid-js'
import { PitchWordmark } from './brand'
import { SOCIALS } from './socials'
import '../../styles/landing-broadcast.css'

export { SOCIALS } from './socials'

export interface Footer15Link {
  label: string
  href: string
  icon?: (props: { class?: string; size?: number }) => JSX.Element
}
export interface Footer15Column {
  title: string
  links: Footer15Link[]
}
export interface Footer15Props {
  logoIcon?: JSX.Element
  description?: string
  columns?: Footer15Column[]
}

const columns: Footer15Column[] = [
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Contact', href: 'mailto:support@trypitch.co' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
  {
    title: 'Product',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Docs', href: '/docs' },
      { label: 'API Reference', href: '/docs/api' },
    ],
  },
  { title: 'Social', links: SOCIALS },
]
const InternalOrExternal = (props: { link: Footer15Link }) =>
  props.link.href.startsWith('/') ? (
    <A
      href={props.link.href}
      class="inline-block text-xs leading-none font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:text-white"
    >
      {props.link.label}
    </A>
  ) : (
    <a
      href={props.link.href}
      target={props.link.href.startsWith('http') ? '_blank' : undefined}
      rel={props.link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
      class="inline-block text-xs leading-none font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:text-white"
    >
      {props.link.label}
    </a>
  )

export function Footer15(props: Footer15Props) {
  let root!: HTMLElement
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        ;[...root.querySelectorAll<HTMLElement>('[data-footer-rise]')].forEach((el, i) =>
          el.animate(
            [
              { opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)' },
              { opacity: 1, transform: 'none', filter: 'blur(0)' },
            ],
            { duration: 600, delay: i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
          ),
        )
        io.disconnect()
      },
      { threshold: 0.1 },
    )
    io.observe(root)
  })
  const cols = () => props.columns ?? columns
  return (
    <footer
      ref={root}
      class="w-full overflow-hidden rounded-t-4xl bg-black text-white font-sans antialiased sm:rounded-t-[2.5rem] md:rounded-t-[3rem]"
    >
      <div class="px-6 pt-6 pb-2 sm:px-10 sm:pt-8 lg:px-14 lg:pt-10 xl:px-20">
        <div class="mx-auto flex max-w-[1440px] flex-col items-center justify-center gap-8 text-center">
          <div data-footer-rise class="flex shrink-0 flex-col items-center text-center gap-5">
            <div class="flex items-center justify-center w-full">
              <span class="shrink-0 text-white">
                {props.logoIcon ?? (
                  <PitchWordmark class="text-white" style={{ height: '40px', width: 'auto' }} />
                )}
              </span>
            </div>
            <p class="text-xs leading-relaxed font-light tracking-wide sm:whitespace-nowrap text-zinc-400">
              {props.description ??
                'The AI agent that turns your product URL into a cinematic pitch video in minutes.'}
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            class="grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4 gap-x-12 gap-y-8"
          >
            <For each={cols()}>
              {column => (
                <div data-footer-rise class="text-center sm:text-left">
                  <h3 class="text-[10px] leading-none font-bold tracking-widest uppercase text-zinc-100">
                    {column.title}
                  </h3>
                  {column.title === 'Social' ? (
                    <div class="flex flex-row gap-4 justify-center sm:justify-start items-center mt-4 leading-none">
                      <For each={column.links}>
                        {link => (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center justify-center text-white hover:text-zinc-300 transition-colors duration-200"
                            aria-label={link.label}
                          >
                            {link.icon?.({ class: 'size-3.5', size: 14 })}
                          </a>
                        )}
                      </For>
                    </div>
                  ) : (
                    <ul class="mt-3 flex flex-col gap-3">
                      <For each={column.links}>
                        {link => (
                          <li>
                            <InternalOrExternal link={link} />
                          </li>
                        )}
                      </For>
                    </ul>
                  )}
                </div>
              )}
            </For>
          </nav>
        </div>
      </div>
      <div class="mt-6 border-t border-zinc-900 px-6 py-4 sm:px-10 lg:px-14 xl:px-20">
        <div class="mx-auto flex max-w-[1440px] items-center justify-center text-center text-xs text-zinc-500">
          <p class="text-[10px] leading-none font-light tracking-widest uppercase text-zinc-500">
            © {new Date().getFullYear()} Pitch. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
export const LandingFooter = () => (
  <div class="lb-chrome flex w-full items-end">
    <Footer15 />
  </div>
)
